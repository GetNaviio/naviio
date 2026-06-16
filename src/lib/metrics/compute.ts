/**
 * Pure metric computation over a classified transaction ledger. No DB, no dates
 * from the environment — callers pass the rows and the window, so every number
 * is deterministic and unit-tested.
 */
import { classify, resolveVendorCategories, resolveTxnCategory, type LedgerTxn, type CategoryOverrides } from './classify'

export interface DatedLedgerTxn extends LedgerTxn {
  date: Date | string
  /** Stable provider id — key for user classification overrides. */
  externalId?: string
}

export interface IncomeStatement {
  totalIncome: number
  totalExpenses: number
  netIncome: number
  netMargin: number | null            // netIncome / totalIncome
  expensesByCategory: { category: string; amount: number }[]
  byMonth: { month: string; income: number; expenses: number; net: number }[]
}

export interface CashFlow {
  cashIn: number
  cashOut: number
  netCashFlow: number                 // cashIn - cashOut (negative ⇒ burn)
  burnRate: number                    // average monthly net outflow (0 if cash-positive)
  byMonth: { month: string; cashIn: number; cashOut: number; net: number }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const monthKey = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

function inWindow(d: Date | string, from?: Date, to?: Date): boolean {
  const t = (typeof d === 'string' ? new Date(d) : d).getTime()
  if (from && t < from.getTime()) return false
  if (to && t > to.getTime()) return false
  return true
}

/**
 * Income statement — CASH BASIS: revenue is recognized when cash is received
 * (Stripe charge / bank deposit) and expense when cash is paid, with transfers,
 * payouts, and loan principal excluded. This is NOT a GAAP accrual statement — it
 * has no AR/AP, deferred revenue, prepaids, depreciation, or COGS split. Surfaces
 * that show it must disclose "cash basis". Optional [from,to] window (inclusive).
 */
export function incomeStatement(
  txns: DatedLedgerTxn[],
  from?: Date,
  to?: Date,
  /** User category overrides (per-vendor default + per-transaction). */
  categoryOverrides?: CategoryOverrides,
): IncomeStatement {
  let totalIncome = 0
  let totalExpenses = 0
  const byCat = new Map<string, number>()
  const months = new Map<string, { income: number; expenses: number }>()

  // One category per vendor across the whole ledger (vendor override > majority
  // signal), resolved over all rows for a stable label regardless of period.
  // Per-transaction overrides (resolveTxnCategory) then win over the vendor default.
  const vendorCat = resolveVendorCategories(txns, categoryOverrides?.byVendor ?? {})

  for (const t of txns) {
    if (!inWindow(t.date, from, to)) continue
    const c = classify(t)
    const mk = monthKey(t.date)
    const m = months.get(mk) ?? { income: 0, expenses: 0 }

    if (c.bucket === 'REVENUE') {
      totalIncome += t.amount
      m.income += t.amount
    } else if (c.bucket === 'EXPENSE') {
      totalExpenses += t.amount
      m.expenses += t.amount
      const cat = resolveTxnCategory(t, vendorCat, categoryOverrides?.byTxn ?? {})
      byCat.set(cat, (byCat.get(cat) ?? 0) + t.amount)
    }
    months.set(mk, m)
  }

  const netIncome = totalIncome - totalExpenses
  return {
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    netIncome: round2(netIncome),
    netMargin: totalIncome > 0 ? round2((netIncome / totalIncome) * 100) : null,
    expensesByCategory: [...byCat.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    byMonth: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        income: round2(v.income),
        expenses: round2(v.expenses),
        net: round2(v.income - v.expenses),
      })),
  }
}

/**
 * Bank cash flow (cash-basis): real money moving through depository accounts.
 * A Stripe payout counts as cash IN; internal account transfers are excluded;
 * loan principal counts as cash OUT. Operates on Plaid-style rows only.
 */
export function cashFlow(txns: DatedLedgerTxn[], from?: Date, to?: Date): CashFlow {
  let cashIn = 0
  let cashOut = 0
  const months = new Map<string, { cashIn: number; cashOut: number }>()

  for (const t of txns) {
    if (t.source !== 'plaid') continue           // cash = actual bank activity
    if (!inWindow(t.date, from, to)) continue
    const c = classify(t)
    if (c.transferKind === 'INTERNAL') continue  // own-account move, not cash flow

    const mk = monthKey(t.date)
    const m = months.get(mk) ?? { cashIn: 0, cashOut: 0 }
    if (t.type === 'CREDIT') { cashIn += t.amount; m.cashIn += t.amount }
    else { cashOut += t.amount; m.cashOut += t.amount }
    months.set(mk, m)
  }

  const byMonth = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, cashIn: round2(v.cashIn), cashOut: round2(v.cashOut), net: round2(v.cashIn - v.cashOut) }))

  // Burn = average monthly net OUTFLOW over the observed months (0 if cash-positive).
  const negativeMonths = byMonth.filter((m) => m.net < 0)
  const burnRate = negativeMonths.length
    ? round2(Math.abs(negativeMonths.reduce((s, m) => s + m.net, 0)) / negativeMonths.length)
    : 0

  return {
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    netCashFlow: round2(cashIn - cashOut),
    burnRate,
    byMonth,
  }
}

/** Runway in months = cash balance ÷ monthly burn. Infinity when not burning. */
export function runwayMonths(cashBalance: number, burnRate: number): number {
  if (burnRate <= 0) return Infinity
  return round2(cashBalance / burnRate)
}
