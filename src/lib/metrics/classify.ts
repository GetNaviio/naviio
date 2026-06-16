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

// Credit-card / loan payments by description — banks (and the Plaid sandbox)
// often omit PFC on these. Paying down a card or loan moves money to a liability:
// it's financing, not a P&L expense, so exclude it (mirrors the LOAN_PAYMENTS PFC).
const CAPITAL_DESC_RE = /\b(credit\s?card.*payment|cardmember|card\s?member|cc payment|payment\s*-?\s*thank\s?you|loan payment|mortgage)\b/i

function isCapital(t: LedgerTxn): boolean {
  const c = (t.category ?? '').toUpperCase()
  if (CAPITAL_PFC.has(c)) return true
  return CAPITAL_DESC_RE.test(`${t.description ?? ''} ${t.merchantName ?? ''}`)
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

// Keyword fallback: when Plaid gives no PFC (legacy `category`, or none at all),
// infer the category from the merchant/description so spend lands somewhere
// meaningful instead of piling into 'Other'. First match wins; specific → generic.
// Every label here is a member of USER_CATEGORIES so reclassify/COGS stay in sync.
const KEYWORD_RULES: [RegExp, string][] = [
  [/\b(gusto|adp|paychex|rippling|deel|justworks|payroll|upwork|fiverr|contractor)\b/i, 'Payroll & Contractors'],
  [/\b(google ads|adwords|meta ads|facebook ads|fb ads|linkedin ads|tiktok ads|mailchimp|klaviyo|advertis|marketing)\b/i, 'Advertising & Marketing'],
  [/\b(aws|amazon web services|gcp|google cloud|azure|vercel|netlify|heroku|digital ?ocean|cloudflare|github|gitlab|atlassian|jira|slack|zoom|notion|figma|adobe|openai|anthropic|twilio|sendgrid|datadog|sentry|stripe|quickbooks|intuit|salesforce|hubspot|zendesk|godaddy|namecheap|software|subscription)\b/i, 'Software & Services'],
  [/\b(insurance|geico|allstate|state farm|progressive|nationwide|the hartford)\b/i, 'Insurance'],
  [/\b(legal|attorney|law firm|accounting|accountant|\bcpa\b|consult|bookkeep|notary)\b/i, 'Professional Fees'],
  [/\b(airlines?|united air|delta air|american air|southwest|jetblue|hotel|marriott|hilton|hyatt|airbnb|expedia|booking\.com|lodging|\bflight\b)\b/i, 'Travel'],
  [/\b(uber|lyft|taxi|shell|chevron|exxon|mobil|gas station|fuel|parking|transit|metro|caltrain|amtrak|\btoll\b)\b/i, 'Transportation'],
  [/\b(starbucks|mcdonald|chipotle|\bkfc\b|subway|doordash|grubhub|uber ?eats|restaurant|coffee|cafe|brewery|pizza|dunkin|panera|grocery|safeway|whole foods|trader joe)\b/i, 'Meals & Entertainment'],
  [/\b(rent|wework|\blease\b|comcast|xfinity|verizon|at&t|t-mobile|pg&e|electric|water utility|internet|utility|landlord)\b/i, 'Rent & Utilities'],
  [/\b(bank fee|service charge|overdraft|atm fee|wire fee|finance charge|\bnsf\b)\b/i, 'Bank Fees'],
  [/\b(apple store|best buy|\bdell\b|lenovo|staples|office depot|equipment|hardware)\b/i, 'Equipment'],
  [/\b(amazon|walmart|target|costco|ebay|etsy)\b/i, 'Merchandise'],
]

function keywordCategory(text: string): string | null {
  // Bank descriptors often jam tokens together with no space ("CreditGUSTO PAY",
  // "POS DEBIT…"). Split camelCase and letter↔digit runs so the word-boundary
  // rules still match the embedded merchant.
  const normalized = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
  for (const [re, cat] of KEYWORD_RULES) if (re.test(normalized)) return cat
  return null
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

  // 5) Everything else going out → an operating expense. Use Plaid's PFC label
  //    when present; otherwise infer from the merchant/description so it doesn't
  //    fall into 'Other'.
  const label = expenseLabel(t.category)
  const expenseCategory = label !== 'Other'
    ? label
    : (keywordCategory(`${t.description ?? ''} ${t.merchantName ?? ''}`) ?? 'Other')
  return { bucket: 'EXPENSE', expenseCategory, excludedFromPnl: false }
}
