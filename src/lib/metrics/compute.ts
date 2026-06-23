/**
 * Pure metric computation over a classified transaction ledger. No DB, no dates
 * from the environment — callers pass the rows and the window, so every number
 * is deterministic and unit-tested.
 */
import { classifyWithOverride, resolveVendorCategories, resolveTxnCategory, vendorKey, type LedgerTxn, type CategoryOverrides, type CommunityPrior } from './classify'
import { expandRevenueRecognition, deferredRevenueAsOf } from './revenue-recognition'
import { isCogsHeuristic, type ExpenseClass } from '@/lib/model/cogs'

/** The user's explicit override for a row (per-transaction wins over per-vendor), or null. */
function userOverrideFor(
  t: LedgerTxn & { externalId?: string | null },
  overrides?: CategoryOverrides,
): string | null {
  if (!overrides) return null
  if (t.externalId && overrides.byTxn[t.externalId]) return overrides.byTxn[t.externalId]
  const vk = vendorKey(t)
  return (vk && overrides.byVendor[vk]) || null
}

export interface DatedLedgerTxn extends LedgerTxn {
  date: Date | string
  /** Stable provider id — key for user classification overrides. */
  externalId?: string
  /** Revenue-recognition service window (subscription charges spanning >1 month).
   *  When set, revenue is recognized ratably across it; NULL → recognized on date. */
  recognitionStart?: Date | string | null
  recognitionEnd?: Date | string | null
}

export interface IncomeStatement {
  totalIncome: number
  totalExpenses: number
  // Cost of revenue split out of totalExpenses, so the P&L shows a gross-profit
  // line for ANY industry (SaaS infra, e-comm goods, restaurant food, trades
  // materials/subs). operatingExpenses = totalExpenses − cogs.
  cogs: number
  grossProfit: number                 // totalIncome − cogs
  grossMargin: number | null          // grossProfit / totalIncome (%)
  operatingExpenses: number           // totalExpenses − cogs
  operatingIncome: number             // grossProfit − operatingExpenses (= netIncome on cash basis)
  netIncome: number
  netMargin: number | null            // netIncome / totalIncome
  expensesByCategory: { category: string; amount: number }[]
  byMonth: { month: string; income: number; expenses: number; net: number }[]
  /** Cash collected but not yet earned (unrecognized portion of multi-month
   *  subscription charges) as of the window end. 0 when no deferred revenue. */
  deferredRevenue: number
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
 * Income statement — MODIFIED CASH BASIS: expense is recognized when cash is
 * paid; revenue is recognized when cash is received (Stripe charge / bank deposit)
 * EXCEPT that a subscription charge covering a multi-month service period is
 * recognized ratably across that period (deferred revenue) — so an annual plan
 * shows 1/12 per month, not a lump in the billing month. Transfers, payouts, and
 * loan principal are excluded. Still no AR/AP, prepaids, depreciation, or accrual
 * COGS. Optional [from,to] window (inclusive).
 */
export function incomeStatement(
  txns: DatedLedgerTxn[],
  from?: Date,
  to?: Date,
  /** User category overrides (per-vendor default + per-transaction). */
  categoryOverrides?: CategoryOverrides,
  /** Cross-org community prior — fills vendors the heuristics couldn't name, so
   *  the by-category breakdown matches the transactions table. */
  community?: CommunityPrior,
  /** User COGS/OpEx tags keyed by externalId (override the heuristic). */
  expenseClassOverrides?: Record<string, ExpenseClass>,
): IncomeStatement {
  let totalIncome = 0
  let totalExpenses = 0
  let cogs = 0
  const byCat = new Map<string, number>()
  const months = new Map<string, { income: number; expenses: number }>()

  // Deferred revenue as of the window end (before spreading, off the raw charges).
  const deferredRevenue = deferredRevenueAsOf(txns, to ?? new Date())
  // Recognize multi-month subscription revenue ratably: replace each such charge
  // with monthly slices. Monthly/one-time charges and all expenses are untouched.
  txns = expandRevenueRecognition(txns)

  // One category per vendor across the whole ledger (vendor override > majority
  // signal > community prior), resolved over all rows for a stable label
  // regardless of period. Per-transaction overrides then win over the vendor default.
  const vendorCat = resolveVendorCategories(txns, categoryOverrides?.byVendor ?? {}, community ?? new Map())

  for (const t of txns) {
    if (!inWindow(t.date, from, to)) continue
    // Effective bucket honors a user's cross-bucket override (e.g. a mislabeled
    // transfer the user reclassified as an expense, or a row excluded from P&L).
    const eff = classifyWithOverride(t, userOverrideFor(t, categoryOverrides))
    const mk = monthKey(t.date)
    const m = months.get(mk) ?? { income: 0, expenses: 0 }

    if (eff.bucket === 'REVENUE') {
      totalIncome += t.amount
      m.income += t.amount
    } else if (eff.bucket === 'EXPENSE') {
      totalExpenses += t.amount
      m.expenses += t.amount
      const cat = resolveTxnCategory(t, vendorCat, categoryOverrides?.byTxn ?? {})
      byCat.set(cat, (byCat.get(cat) ?? 0) + t.amount)
      // Cost-of-revenue split (user tag wins over the cross-industry heuristic).
      const ec = (t.externalId && expenseClassOverrides?.[t.externalId]) ?? (isCogsHeuristic(t) ? 'COGS' : 'OPEX')
      if (ec === 'COGS') cogs += t.amount
    }
    months.set(mk, m)
  }

  const netIncome = totalIncome - totalExpenses
  const grossProfit = totalIncome - cogs
  const operatingExpenses = totalExpenses - cogs
  return {
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    grossMargin: totalIncome > 0 ? round2((grossProfit / totalIncome) * 100) : null,
    operatingExpenses: round2(operatingExpenses),
    operatingIncome: round2(grossProfit - operatingExpenses),
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
    deferredRevenue,
  }
}

/**
 * Bank cash flow (cash-basis): real money moving through depository accounts.
 * A Stripe payout counts as cash IN; internal account transfers are excluded;
 * loan principal counts as cash OUT. Operates on Plaid-style rows only.
 */
export function cashFlow(txns: DatedLedgerTxn[], from?: Date, to?: Date, categoryOverrides?: CategoryOverrides): CashFlow {
  let cashIn = 0
  let cashOut = 0
  const months = new Map<string, { cashIn: number; cashOut: number }>()

  for (const t of txns) {
    if (t.source !== 'plaid') continue           // cash = actual bank activity
    if (!inWindow(t.date, from, to)) continue
    // Honor user overrides: a row excluded from P&L (or auto-internal) is not cash
    // flow; a transfer the user reclassified as an expense IS real cash out.
    const eff = classifyWithOverride(t, userOverrideFor(t, categoryOverrides))
    if (!eff.inCashFlow) continue                // own-account / excluded move

    const mk = monthKey(t.date)
    const m = months.get(mk) ?? { cashIn: 0, cashOut: 0 }
    if (t.type === 'CREDIT') { cashIn += t.amount; m.cashIn += t.amount }
    else { cashOut += t.amount; m.cashOut += t.amount }
    months.set(mk, m)
  }

  const byMonth = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, cashIn: round2(v.cashIn), cashOut: round2(v.cashOut), net: round2(v.cashIn - v.cashOut) }))

  // Net burn = the average monthly net cash OUTFLOW over the trailing COMPLETE
  // months — cash-positive/break-even months INCLUDED (averaging only the
  // negative months cherry-picks and overstates burn / shortens runway). The
  // most-recent month is usually partial, so it's excluded from the average when
  // older months exist. A net cash-generating window yields 0 burn.
  const completeMonths = byMonth.length > 1 ? byMonth.slice(0, -1) : byMonth
  const burnWindow = completeMonths.slice(-3) // trailing 3 complete months
  const avgNet = burnWindow.length
    ? burnWindow.reduce((s, m) => s + m.net, 0) / burnWindow.length
    : 0
  const burnRate = avgNet < 0 ? round2(-avgNet) : 0

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
