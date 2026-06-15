/**
 * Gross-margin income statement built from a classified ledger.
 *
 *   Revenue
 * − COGS                (cost of revenue)
 * = Gross Profit        (Gross Margin % = Gross Profit ÷ Revenue)
 * − OpEx                (operating expenses)
 * = Operating Income    (== net on this cash-basis ledger)
 *
 * Pure + side-effect free. User tags (overrides keyed by externalId) win over
 * the COGS/OpEx heuristic.
 */
import type { LedgerTxn } from '@/lib/metrics/classify'
import { classifyExpense, type ExpenseClass } from '@/lib/model/cogs'

export interface ModelTxn extends LedgerTxn {
  /** Stable id used to look up a user override. */
  externalId?: string
}

export interface ModelStatement {
  revenue: number
  cogs: number
  grossProfit: number
  /** Gross Profit ÷ Revenue, or null when there is no revenue. */
  grossMargin: number | null
  opex: number
  operatingIncome: number
  /** Operating Income ÷ Revenue, or null when there is no revenue. */
  operatingMargin: number | null
}

export function modelIncomeStatement(
  txns: ModelTxn[],
  overrides: Record<string, ExpenseClass> = {},
): ModelStatement {
  let revenue = 0
  let cogs = 0
  let opex = 0

  for (const t of txns) {
    const override = t.externalId ? overrides[t.externalId] : undefined
    const c = classifyExpense(t, override ?? null)
    if (c.bucket === 'REVENUE') {
      revenue += t.amount
    } else if (c.bucket === 'EXPENSE') {
      if (c.expenseClass === 'COGS') cogs += t.amount
      else if (c.expenseClass === 'OPEX') opex += t.amount
      // 'OTHER' is intentionally excluded from gross-margin math.
    }
    // TRANSFER rows are not P&L events.
  }

  const grossProfit = revenue - cogs
  const operatingIncome = grossProfit - opex
  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin: revenue > 0 ? grossProfit / revenue : null,
    opex,
    operatingIncome,
    operatingMargin: revenue > 0 ? operatingIncome / revenue : null,
  }
}
