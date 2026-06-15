/**
 * COGS vs OpEx classification — the gross-margin core.
 *
 * The base classifier (lib/metrics/classify) splits the ledger into
 * REVENUE / EXPENSE / TRANSFER. The financial model needs one more cut: of the
 * EXPENSE rows, which are COST OF REVENUE (COGS — hosting/infra serving
 * customers, payment processing, fulfillment, materials) vs operating expense.
 *
 * Resolution order: user override > heuristic (Plaid PFC + keywords) > OpEx.
 * Pure + side-effect free so the rules are unit-tested without a DB.
 */
import { classify, type LedgerTxn, type Bucket } from '@/lib/metrics/classify'

export type ExpenseClass = 'COGS' | 'OPEX' | 'OTHER'

// Plaid personal_finance_category.primary values that usually mean cost of revenue.
const COGS_PFC = new Set([
  'GENERAL_MERCHANDISE', // inventory / goods for resale
])

// Keyword hints (description / merchant) for clear cost-of-revenue spend:
// cloud hosting & infra that serves customers, payment processing, shipping /
// fulfillment, raw materials / manufacturing / suppliers.
const COGS_KEYWORDS =
  /\b(aws|amazon web services|gcp|google cloud|microsoft azure|\bazure\b|cloudflare|vercel|heroku|digital ?ocean|twilio|sendgrid|processing fee|payment processing|interchange|shipping|freight|fulfillment|3pl|manufactur|supplier|wholesale|raw material|cost of goods|cogs)\b/i

export interface ClassifiedExpense {
  bucket: Bucket
  /** COGS / OPEX / OTHER when bucket === 'EXPENSE'; null otherwise. */
  expenseClass: ExpenseClass | null
  excludedFromPnl: boolean
  /** Friendly expense category from the base classifier (when an expense). */
  category?: string
}

function isCogsHeuristic(t: LedgerTxn): boolean {
  const pfc = (t.category ?? '').toUpperCase()
  if (COGS_PFC.has(pfc)) return true
  const text = `${t.description ?? ''} ${t.merchantName ?? ''}`
  return COGS_KEYWORDS.test(text)
}

/**
 * Decide COGS vs OpEx for a single ledger row. Non-expense rows (revenue /
 * transfers) return expenseClass = null and pass through the base bucket.
 */
export function classifyExpense(t: LedgerTxn, override?: ExpenseClass | null): ClassifiedExpense {
  const c = classify(t)
  if (c.bucket !== 'EXPENSE') {
    return { bucket: c.bucket, expenseClass: null, excludedFromPnl: c.excludedFromPnl }
  }
  const expenseClass: ExpenseClass = override ?? (isCogsHeuristic(t) ? 'COGS' : 'OPEX')
  return { bucket: 'EXPENSE', expenseClass, excludedFromPnl: false, category: c.expenseCategory }
}
