/**
 * Transaction classification — the accuracy core.
 *
 * Plaid (bank) + Stripe (payments) are the source of truth. Because money that
 * Stripe collects later lands in the bank as a payout, and because banks contain
 * internal transfers / card payments / loan principal that are NOT P&L events, we
 * must classify every ledger row into exactly one bucket and exclude the noise.
 *
 * Pure + side-effect free so the rules are unit-tested without a DB.
 */

export type Bucket = 'REVENUE' | 'EXPENSE' | 'TRANSFER'

/**
 * Sub-type for TRANSFER rows — lets cash-flow include real cash arriving
 * (a Stripe payout) while still excluding it from P&L and ignoring purely
 * internal account-to-account moves.
 */
export type TransferKind = 'STRIPE_PAYOUT' | 'INTERNAL' | 'CAPITAL'

/** Minimal shape needed to classify — a subset of the Transaction row. */
export interface LedgerTxn {
  source: string                 // 'plaid' | 'stripe' | 'quickbooks' | 'xero' | ...
  type: 'CREDIT' | 'DEBIT'       // CREDIT = money in, DEBIT = money out
  amount: number                 // magnitude, major units
  category?: string | null       // Plaid PFC primary, or 'REVENUE' for Stripe
  description?: string | null
  merchantName?: string | null
}

export interface Classification {
  bucket: Bucket
  /** Set when bucket === 'TRANSFER'. */
  transferKind?: TransferKind
  /** Friendly expense category (only set when bucket === 'EXPENSE'). */
  expenseCategory?: string
  /** True when the row is excluded from P&L (transfer/payout/capital). */
  excludedFromPnl: boolean
}

// Plaid personal_finance_category.primary values that are NOT P&L events.
const TRANSFER_PFC = new Set(['TRANSFER_IN', 'TRANSFER_OUT'])
// Loan payments bundle principal (financing, ASC 230 — not a P&L expense) with
// interest (which IS a deductible expense). Plaid doesn't split them, so we
// conservatively exclude the whole row from P&L. KNOWN LIMITATION: this drops the
// interest portion, slightly understating expense / overstating net income; the
// P&L footnote discloses it. Robust fix needs Plaid loan-detail enrichment.
const CAPITAL_PFC = new Set(['LOAN_PAYMENTS'])

// Stripe payouts land in the bank already counted as Stripe charges. We match on
// "stripe" specifically (not a bare "payout", which would wrongly exclude
// unrelated payout-style credits). The robust dedup is to reconcile bank credits
// against Stripe `payouts.list` by amount/date — tracked as a follow-up.
const STRIPE_PAYOUT_RE = /\bstripe\b/i

/** A Stripe payout that has landed in the bank — already counted as Stripe revenue. */
export function isStripePayout(t: LedgerTxn): boolean {
  if (t.source !== 'plaid' || t.type !== 'CREDIT') return false
  const text = `${t.description ?? ''} ${t.merchantName ?? ''}`
  return STRIPE_PAYOUT_RE.test(text)
}

function isTransfer(t: LedgerTxn): boolean {
  const c = (t.category ?? '').toUpperCase()
  return TRANSFER_PFC.has(c)
}

function isCapital(t: LedgerTxn): boolean {
  const c = (t.category ?? '').toUpperCase()
  return CAPITAL_PFC.has(c)
}

// Map a Plaid PFC primary → a human-friendly expense category for the UI.
const EXPENSE_LABELS: Record<string, string> = {
  RENT_AND_UTILITIES: 'Rent & Utilities',
  GENERAL_SERVICES: 'Software & Services',
  GENERAL_MERCHANDISE: 'Merchandise',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  FOOD_AND_DRINK: 'Meals & Entertainment',
  ENTERTAINMENT: 'Entertainment',
  BANK_FEES: 'Bank Fees',
  MEDICAL: 'Medical',
  PERSONAL_CARE: 'Personal Care',
  HOME_IMPROVEMENT: 'Home Improvement',
  GOVERNMENT_AND_NON_PROFIT: 'Taxes & Government',
  PERSONAL_FINANCE: 'Financial Services',
}

/**
 * Categories a user may reclassify a transaction into. The auto-classifier's
 * labels plus common business categories the PFC taxonomy lacks. 'Other' last.
 */
export const USER_CATEGORIES: string[] = [
  ...new Set([
    ...Object.values(EXPENSE_LABELS),
    'Advertising & Marketing',
    'Payroll & Contractors',
    'Insurance',
    'Professional Fees',
    'Equipment',
  ]),
].sort().concat('Other')

export function expenseLabel(category?: string | null): string {
  if (!category) return 'Other'
  return EXPENSE_LABELS[category.toUpperCase()] ?? 'Other'
}

/**
 * Classify a single ledger row. Order matters: payouts and transfers are checked
 * before income/expense so already-counted money never inflates the P&L.
 */
export function classify(t: LedgerTxn): Classification {
  // 1) Stripe payout landing in the bank → already counted as Stripe revenue
  //    (excluded from P&L, but it IS real cash arriving — see transferKind).
  if (isStripePayout(t)) return { bucket: 'TRANSFER', transferKind: 'STRIPE_PAYOUT', excludedFromPnl: true }

  // 2) Internal transfers (own accounts) → not cash in/out, not P&L.
  if (isTransfer(t)) return { bucket: 'TRANSFER', transferKind: 'INTERNAL', excludedFromPnl: true }

  // 3) Loan principal / capital movements → real cash out, but not a P&L expense.
  if (isCapital(t)) return { bucket: 'TRANSFER', transferKind: 'CAPITAL', excludedFromPnl: true }

  // 4) Stripe charges and other money-in → revenue.
  if (t.type === 'CREDIT') return { bucket: 'REVENUE', excludedFromPnl: false }

  // 5) Everything else going out → an operating expense.
  return { bucket: 'EXPENSE', expenseCategory: expenseLabel(t.category), excludedFromPnl: false }
}
