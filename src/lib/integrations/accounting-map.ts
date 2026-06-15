/**
 * Pure parsers that distil a QuickBooks or Xero report into a small, normalized
 * accounting summary. No network, no DB — so they unit-test cleanly against
 * captured report fixtures.
 *
 * Both providers return a nested "Rows" tree of section/summary rows. We don't
 * try to reconstruct the whole statement; we pull the figures the dashboard
 * needs: total income, total expenses, net income, gross profit, and the
 * outstanding-invoice tally.
 */

export interface AccountingSummary {
  source: 'quickbooks' | 'xero' | 'synthesized'
  totalIncome: number | null
  totalExpenses: number | null
  netIncome: number | null
  grossProfit: number | null
  outstandingCount: number | null
  outstandingAmount: number | null
  currency: string | null
}

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

// ─── QuickBooks ────────────────────────────────────────────────────────────────
// P&L report rows carry a `group` ("Income" | "Expenses" | "GrossProfit" |
// "NetIncome" | …). The summary total is the last cell of Summary.ColData.

interface QBORow {
  group?: string
  type?: string
  Summary?: { ColData?: { value?: string }[] }
  Rows?: { Row?: QBORow[] }
}

function qboSummaryValue(row: QBORow): number | null {
  const cells = row.Summary?.ColData
  if (!cells?.length) return null
  return num(cells[cells.length - 1]?.value)
}

/** Extract income/expenses/net/gross from a QuickBooks ProfitAndLoss report. */
export function parseQBOProfitAndLoss(report: unknown): Partial<AccountingSummary> {
  const r = report as { Header?: { Currency?: string }; Rows?: { Row?: QBORow[] } } | null
  const rows = r?.Rows?.Row ?? []
  const out: Partial<AccountingSummary> = { currency: r?.Header?.Currency ?? null }

  const walk = (list: QBORow[]) => {
    for (const row of list) {
      switch (row.group) {
        case 'Income':      out.totalIncome   = qboSummaryValue(row) ?? out.totalIncome;   break
        case 'Expenses':    out.totalExpenses = qboSummaryValue(row) ?? out.totalExpenses; break
        case 'GrossProfit': out.grossProfit   = qboSummaryValue(row) ?? out.grossProfit;   break
        case 'NetIncome':   out.netIncome     = qboSummaryValue(row) ?? out.netIncome;     break
      }
      if (row.Rows?.Row?.length) walk(row.Rows.Row)
    }
  }
  walk(rows)
  return out
}

/** Outstanding (unpaid) invoices from a QuickBooks Invoice query response. */
export function parseQBOInvoices(report: unknown): { outstandingCount: number; outstandingAmount: number } {
  const invoices = (report as { QueryResponse?: { Invoice?: { Balance?: number }[] } } | null)?.QueryResponse?.Invoice ?? []
  let amount = 0
  let count = 0
  for (const inv of invoices) {
    const bal = num(inv.Balance) ?? 0
    if (bal > 0) { count++; amount += bal }
  }
  return { outstandingCount: count, outstandingAmount: amount }
}

// ─── Xero ───────────────────────────────────────────────────────────────────────
// Xero P&L lives under Reports[0].Rows. Section/summary rows carry a Title or a
// first Cell label; the trailing Cell holds the value. Labels vary by org, so we
// match on patterns rather than exact strings.

interface XeroCell { Value?: string }
interface XeroRow {
  RowType?: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroRow[]
}

function xeroRowLabel(row: XeroRow): string {
  return (row.Title || row.Cells?.[0]?.Value || '').trim()
}
function xeroRowValue(row: XeroRow): number | null {
  const cells = row.Cells
  if (!cells?.length) return null
  return num(cells[cells.length - 1]?.Value)
}

/** Extract income/expenses/net/gross from a Xero ProfitAndLoss report. */
export function parseXeroProfitAndLoss(report: unknown): Partial<AccountingSummary> {
  const rep = (report as { Reports?: { Rows?: XeroRow[] }[] } | null)?.Reports?.[0]
  const out: Partial<AccountingSummary> = {}
  if (!rep?.Rows) return out

  const consider = (label: string, value: number | null) => {
    if (value == null) return
    const l = label.toLowerCase()
    if (/^total\s+(income|revenue|trading income)/.test(l)) out.totalIncome = value
    else if (/^total\s+(operating expenses|expenses)/.test(l)) out.totalExpenses = value
    else if (/gross profit/.test(l)) out.grossProfit = value
    else if (/(net profit|net income)/.test(l)) out.netIncome = value
  }

  const walk = (list: XeroRow[]) => {
    for (const row of list) {
      if (row.RowType === 'SummaryRow' || row.RowType === 'Row') {
        consider(xeroRowLabel(row), xeroRowValue(row))
      }
      if (row.Rows?.length) walk(row.Rows)
    }
  }
  walk(rep.Rows)
  return out
}

/** Outstanding (authorised, unpaid) invoices from a Xero Invoices response. */
export function parseXeroInvoices(report: unknown): { outstandingCount: number; outstandingAmount: number } {
  const invoices = (report as { Invoices?: { AmountDue?: number; Status?: string }[] } | null)?.Invoices ?? []
  let amount = 0
  let count = 0
  for (const inv of invoices) {
    const due = num(inv.AmountDue) ?? 0
    if (due > 0) { count++; amount += due }
  }
  return { outstandingCount: count, outstandingAmount: amount }
}

// ─── Unified summary ─────────────────────────────────────────────────────────────

interface ProviderRaw {
  profitAndLoss?: unknown
  invoices?: unknown
}

/**
 * Pick whichever accounting provider returned data (QuickBooks preferred when
 * both are present) and produce a single normalized summary, or null if neither
 * has usable figures.
 */
export function summarizeAccounting(
  qbo: ProviderRaw | null | undefined,
  xero: ProviderRaw | null | undefined,
): AccountingSummary | null {
  if (qbo?.profitAndLoss || qbo?.invoices) {
    const pl = parseQBOProfitAndLoss(qbo.profitAndLoss)
    const inv = parseQBOInvoices(qbo.invoices)
    return {
      source: 'quickbooks',
      totalIncome: pl.totalIncome ?? null,
      totalExpenses: pl.totalExpenses ?? null,
      netIncome: pl.netIncome ?? null,
      grossProfit: pl.grossProfit ?? null,
      outstandingCount: inv.outstandingCount,
      outstandingAmount: inv.outstandingAmount,
      currency: pl.currency ?? null,
    }
  }
  if (xero?.profitAndLoss || xero?.invoices) {
    const pl = parseXeroProfitAndLoss(xero.profitAndLoss)
    const inv = parseXeroInvoices(xero.invoices)
    return {
      source: 'xero',
      totalIncome: pl.totalIncome ?? null,
      totalExpenses: pl.totalExpenses ?? null,
      netIncome: pl.netIncome ?? null,
      grossProfit: pl.grossProfit ?? null,
      outstandingCount: inv.outstandingCount,
      outstandingAmount: inv.outstandingAmount,
      currency: pl.currency ?? null,
    }
  }
  return null
}
