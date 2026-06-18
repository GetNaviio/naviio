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

/** Where a classification came from — drives the confidence score and audit. */
export type ClassificationSource = 'user' | 'community' | 'merchant' | 'plaid' | 'recurrence' | 'rule' | 'fallback'

export interface Classification {
  bucket: Bucket
  /** Set when bucket === 'TRANSFER'. */
  transferKind?: TransferKind
  /** Friendly expense category (only set when bucket === 'EXPENSE'). */
  expenseCategory?: string
  /** True when the row is excluded from P&L (transfer/payout/capital). */
  excludedFromPnl: boolean
  /** 0..1 — how sure we are of the category. Overrides are 1; the 'Other'
   *  fallback is low. Used for the needs-review queue and the UI. */
  confidence: number
  /** Which layer resolved this row. */
  source: ClassificationSource
  /** True when an expense couldn't be confidently categorized (→ review queue). */
  needsReview?: boolean
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

// Bank descriptors often jam tokens together with no space ("CreditGUSTO PAY",
// "POS DEBIT…"). Split camelCase and letter↔digit runs so word-boundary rules
// still match the embedded merchant.
function splitJammedTokens(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
}

/**
 * Merchant registry — ONE data-driven table instead of scattered keyword lists
 * and special-case guards. Each rule maps a descriptor pattern to a category:
 *   beatsTransfer — a DEBIT here is a real P&L expense even when Plaid filed the
 *                   ACH as a TRANSFER (payroll is the classic case). Checked
 *                   before the transfer rule.
 *   brand         — a recognizable brand/processor (high confidence) vs. a
 *                   generic word like "software"/"rent" (lower confidence).
 * First match wins; specific → generic. Every category is in USER_CATEGORIES so
 * reclassify/COGS stay in sync. New merchants are added here (data), not in code
 * branches — and the community map (below) extends this automatically over time.
 */
interface MerchantRule { match: RegExp; category: string; beatsTransfer?: boolean; brand?: boolean }

const MERCHANT_RULES: MerchantRule[] = [
  // Payroll processors — always a P&L expense, even if Plaid says transfer.
  { match: /\b(gusto|adp|paychex|rippling|deel|justworks|trinet|zenefits|bamboo\s?hr|wave\s?payroll)\b/i, category: 'Payroll & Contractors', beatsTransfer: true, brand: true },
  { match: /\b(upwork|fiverr|contractor|payroll)\b/i, category: 'Payroll & Contractors' },
  // Advertising / marketing
  { match: /\b(google ads|adwords|meta ads|facebook ads|fb ads|linkedin ads|tiktok ads|mailchimp|klaviyo)\b/i, category: 'Advertising & Marketing', brand: true },
  { match: /\b(advertis|marketing)\b/i, category: 'Advertising & Marketing' },
  // Software & services
  { match: /\b(aws|amazon web services|gcp|google cloud|azure|vercel|netlify|heroku|digital ?ocean|cloudflare|github|gitlab|atlassian|jira|slack|zoom|notion|figma|adobe|openai|anthropic|twilio|sendgrid|datadog|sentry|stripe|quickbooks|intuit|salesforce|hubspot|zendesk|godaddy|namecheap)\b/i, category: 'Software & Services', brand: true },
  { match: /\b(software|subscription|saas)\b/i, category: 'Software & Services' },
  // Insurance
  { match: /\b(geico|allstate|state farm|progressive|nationwide|the hartford)\b/i, category: 'Insurance', brand: true },
  { match: /\binsurance\b/i, category: 'Insurance' },
  // Professional fees
  { match: /\b(legal|attorney|law firm|accounting|accountant|\bcpa\b|consult|bookkeep|notary)\b/i, category: 'Professional Fees' },
  // Travel
  { match: /\b(airlines?|united air|delta air|american air|southwest|jetblue|hotel|marriott|hilton|hyatt|airbnb|expedia|booking\.com|lodging|\bflight\b)\b/i, category: 'Travel', brand: true },
  // Transportation
  { match: /\b(uber|lyft|taxi|shell|chevron|exxon|mobil|gas station|fuel|parking|transit|metro|caltrain|amtrak|\btoll\b)\b/i, category: 'Transportation', brand: true },
  // Meals & entertainment
  { match: /\b(starbucks|mcdonald|chipotle|\bkfc\b|subway|doordash|grubhub|uber ?eats|dunkin|panera|safeway|whole foods|trader joe)\b/i, category: 'Meals & Entertainment', brand: true },
  { match: /\b(restaurant|coffee|cafe|brewery|pizza|grocery)\b/i, category: 'Meals & Entertainment' },
  // Rent & utilities
  { match: /\b(wework|comcast|xfinity|verizon|at&t|t-mobile|pg&e)\b/i, category: 'Rent & Utilities', brand: true },
  { match: /\b(rent|\blease\b|electric|water utility|internet|utility|landlord)\b/i, category: 'Rent & Utilities' },
  // Bank fees
  { match: /\b(bank fee|service charge|overdraft|atm fee|wire fee|finance charge|\bnsf\b)\b/i, category: 'Bank Fees' },
  // Equipment
  { match: /\b(apple store|best buy|\bdell\b|lenovo|staples|office depot)\b/i, category: 'Equipment', brand: true },
  { match: /\b(equipment|hardware)\b/i, category: 'Equipment' },
  // Merchandise
  { match: /\b(amazon|walmart|target|costco|ebay|etsy)\b/i, category: 'Merchandise', brand: true },
]

function matchMerchant(text: string): MerchantRule | null {
  const normalized = splitJammedTokens(text)
  for (const r of MERCHANT_RULES) if (r.match.test(normalized)) return r
  return null
}

// A DEBIT to a known expense-vendor (e.g. payroll) is a real P&L expense even
// when Plaid filed the ACH as a TRANSFER. Generalizes the old payroll guard:
// any registry rule flagged beatsTransfer wins over the transfer tag.
function expenseVendorOverride(t: LedgerTxn): MerchantRule | null {
  if (t.type !== 'DEBIT') return null
  const r = matchMerchant(`${t.description ?? ''} ${t.merchantName ?? ''}`)
  return r?.beatsTransfer ? r : null
}

/**
 * Classify a single ledger row, with a confidence score and provenance.
 * Precedence matters: known expense-vendors and payouts/transfers are resolved
 * before generic income/expense so already-counted money never inflates the P&L.
 */
export function classify(t: LedgerTxn): Classification {
  // 0) Known expense-vendor (payroll, etc.) paying out → real P&L expense even
  //    if Plaid tagged the ACH as a transfer. Runs before the transfer rule.
  const ev = expenseVendorOverride(t)
  if (ev) return { bucket: 'EXPENSE', expenseCategory: ev.category, excludedFromPnl: false, confidence: 0.9, source: 'merchant' }

  // 1) Stripe payout landing in the bank → already counted as Stripe revenue.
  if (isStripePayout(t)) return { bucket: 'TRANSFER', transferKind: 'STRIPE_PAYOUT', excludedFromPnl: true, confidence: 0.95, source: 'rule' }

  // 2) Internal transfers (own accounts) → not cash in/out, not P&L.
  if (isTransfer(t)) return { bucket: 'TRANSFER', transferKind: 'INTERNAL', excludedFromPnl: true, confidence: 0.9, source: 'plaid' }

  // 3) Loan principal / capital movements → real cash out, but not a P&L expense.
  if (isCapital(t)) return { bucket: 'TRANSFER', transferKind: 'CAPITAL', excludedFromPnl: true, confidence: 0.85, source: 'rule' }

  // 4) Money-in → revenue.
  if (t.type === 'CREDIT') return { bucket: 'REVENUE', excludedFromPnl: false, confidence: 0.8, source: 'rule' }

  // 5) Money-out → expense. Plaid PFC label → merchant registry → 'Other'.
  //    Confidence reflects which layer named it; 'Other' goes to the review queue.
  const pfc = expenseLabel(t.category)
  if (pfc !== 'Other') return { bucket: 'EXPENSE', expenseCategory: pfc, excludedFromPnl: false, confidence: 0.8, source: 'plaid' }
  const m = matchMerchant(`${t.description ?? ''} ${t.merchantName ?? ''}`)
  if (m) return { bucket: 'EXPENSE', expenseCategory: m.category, excludedFromPnl: false, confidence: m.brand ? 0.85 : 0.6, source: 'merchant' }
  return { bucket: 'EXPENSE', expenseCategory: 'Other', excludedFromPnl: false, confidence: 0.25, source: 'fallback', needsReview: true }
}

/**
 * Stable vendor identity. The same merchant must always map to the same key so
 * it gets one consistent category (and one override) across every transaction.
 * Prefer the clean merchant name; else the description with jammed tokens split
 * and reference/order numbers stripped (so "ACH … GUSTO PAY 123456" and a later
 * "… GUSTO PAY 998877" share a key).
 */
export function vendorKey(t: { merchantName?: string | null; description?: string | null }): string {
  const base = (t.merchantName?.trim() || t.description?.trim() || '')
  return base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\d[\d-]*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** A community prior: vendorKey → the category other orgs have agreed on, with a
 *  confidence in 0..1 (share of votes). Used to fill vendors this org hasn't
 *  fixed and the heuristics couldn't name. Never overrides a user's own fix. */
export type CommunityPrior = Map<string, { category: string; confidence: number }>

/**
 * Resolve ONE expense category per vendor across a set of transactions, so a
 * vendor never appears under two categories. Precedence per vendor:
 *   1. user override (vendorKey → label), applied to all the vendor's txns;
 *   2. else the most common non-'Other' auto label among the vendor's txns;
 *   3. else the community prior (what other orgs agreed this vendor is);
 *   4. else 'Other'.
 * Returns a vendorKey → category map. Callers label each expense row by its
 * vendorKey, guaranteeing consistency everywhere the map is used.
 */
export function resolveVendorCategories(
  txns: LedgerTxn[],
  overridesByVendor: Record<string, string> = {},
  community: CommunityPrior = new Map(),
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>()
  for (const t of txns) {
    const c = classify(t)
    if (c.bucket !== 'EXPENSE') continue
    const vk = vendorKey(t)
    if (!vk) continue
    const label = c.expenseCategory || 'Other'
    const m = votes.get(vk) ?? new Map<string, number>()
    m.set(label, (m.get(label) ?? 0) + 1)
    votes.set(vk, m)
  }
  const out = new Map<string, string>()
  for (const [vk, counts] of votes) {
    if (overridesByVendor[vk]) { out.set(vk, overridesByVendor[vk]); continue }
    let best = 'Other'
    let bestN = 0
    for (const [label, n] of counts) {
      if (label === 'Other') continue
      if (n > bestN) { best = label; bestN = n }
    }
    // Heuristics couldn't name it → fall back to what the community agreed on.
    if (best === 'Other') {
      const prior = community.get(vk)
      if (prior && prior.category !== 'Other') best = prior.category
    }
    out.set(vk, best)
  }
  return out
}

/** The consistent category for a single transaction given a resolved map. */
export function vendorCategoryOf(t: LedgerTxn, resolved: Map<string, string>): string {
  return resolved.get(vendorKey(t)) ?? 'Other'
}

/** User category overrides, split by scope. byTxn wins over byVendor (a single
 *  transaction can differ from its vendor's default — e.g. a laptop bought at a
 *  vendor that's usually office supplies). */
export interface CategoryOverrides {
  byVendor: Record<string, string> // vendorKey → label (applies to the whole vendor)
  byTxn: Record<string, string>    // externalId → label (this transaction only)
}

// A vendor-scoped category override is stored in TxnClassification.externalId as
// `vendor:<vendorKey>` (no schema change vs a per-transaction override, which uses
// the real externalId). The read side splits them back into byVendor / byTxn.
export const VENDOR_OVERRIDE_PREFIX = 'vendor:'

/**
 * Final category for one transaction, applying the full precedence:
 *   per-transaction override > vendor default (resolved map) > 'Other'.
 */
export function resolveTxnCategory(
  t: LedgerTxn & { externalId?: string | null },
  vendorResolved: Map<string, string>,
  txnOverrides: Record<string, string> = {},
): string {
  if (t.externalId && txnOverrides[t.externalId]) return txnOverrides[t.externalId]
  const vk = vendorKey(t)
  if (vk) {
    const resolved = vendorResolved.get(vk)
    if (resolved) return resolved
  }
  // No vendor identity (no merchant/description) → this transaction's own label.
  return classify(t).expenseCategory ?? 'Other'
}

/** Final category plus confidence + provenance, for the review queue and UI. */
export interface ResolvedCategory {
  category: string
  confidence: number
  source: ClassificationSource
  /** Expense that resolved to 'Other' and isn't user-fixed → wants a human. */
  needsReview: boolean
}

/**
 * Like resolveTxnCategory, but also reports confidence + where the label came
 * from. Confidence ladder: user fix (1.0) > per-org vendor default > community
 * prior > the row's own auto classification. An expense still sitting at 'Other'
 * is the review-queue signal.
 */
export function resolveTxnCategoryDetailed(
  t: LedgerTxn & { externalId?: string | null },
  vendorResolved: Map<string, string>,
  txnOverrides: Record<string, string> = {},
  ctx: { overrideVendors?: Set<string>; community?: CommunityPrior } = {},
): ResolvedCategory {
  const base = classify(t)
  // Non-expense rows aren't categorized (Revenue / Transfer) — never reviewed.
  if (base.bucket !== 'EXPENSE') {
    return { category: base.bucket === 'REVENUE' ? 'Revenue' : 'Transfer', confidence: base.confidence, source: base.source, needsReview: false }
  }
  // 1) explicit per-transaction fix
  if (t.externalId && txnOverrides[t.externalId]) {
    return { category: txnOverrides[t.externalId], confidence: 1, source: 'user', needsReview: false }
  }
  const vk = vendorKey(t)
  // 2) per-org vendor default (a user vendor-override is also a confident fix)
  const resolved = vk ? vendorResolved.get(vk) : undefined
  if (resolved && resolved !== 'Other') {
    const userFixed = !!(vk && ctx.overrideVendors?.has(vk))
    return {
      category: resolved,
      confidence: userFixed ? 1 : Math.max(base.confidence, 0.7),
      source: userFixed ? 'user' : base.source,
      needsReview: false,
    }
  }
  // 3) community prior (only when nothing local named it)
  const prior = vk ? ctx.community?.get(vk) : undefined
  if (prior && prior.category !== 'Other') {
    return { category: prior.category, confidence: prior.confidence, source: 'community', needsReview: prior.confidence < 0.5 }
  }
  // 4) the row's own auto label (may be 'Other' → review)
  const category = base.expenseCategory ?? 'Other'
  return { category, confidence: base.confidence, source: base.source, needsReview: category === 'Other' }
}

// ─── Cross-bucket override ──────────────────────────────────────────────────
// A user can correct what BUCKET a row belongs to — not just its expense label:
//   • a DEBIT the engine tagged TRANSFER/CAPITAL that's really an operating cost
//     (e.g. Plaid mislabeled a vendor ACH) → reclassify to an expense category
//     and it counts in the P&L + cash flow;
//   • a row that's actually an internal move → mark EXCLUDE so it drops off the
//     P&L (treated as an internal transfer).
// CREDIT (money-in) rows can't be forced to an expense (avoids nonsense).
export const EXCLUDE_CATEGORY = 'Exclude (transfer / not P&L)'
const EXPENSE_CATEGORY_SET = new Set(USER_CATEGORIES) // real expense labels (excludes the EXCLUDE sentinel)

/** Categories the reclassify UI offers: the expense labels plus the EXCLUDE option. */
export const RECLASSIFY_OPTIONS: string[] = [...USER_CATEGORIES, EXCLUDE_CATEGORY]

export interface EffectiveClassification { bucket: Bucket; inCashFlow: boolean }

/**
 * The bucket after applying a USER override (byTxn or byVendor — not auto labels).
 * Used by the metric engine so a reclassification actually moves the money.
 *   override = EXCLUDE_CATEGORY            → TRANSFER, off cash flow (internal move)
 *   override = expense category + DEBIT    → EXPENSE, counts as cash out
 *   otherwise                              → the auto classification (INTERNAL excluded from cash)
 */
export function classifyWithOverride(t: LedgerTxn, override?: string | null): EffectiveClassification {
  const c = classify(t)
  if (override === EXCLUDE_CATEGORY) return { bucket: 'TRANSFER', inCashFlow: false }
  if (override && t.type === 'DEBIT' && EXPENSE_CATEGORY_SET.has(override)) return { bucket: 'EXPENSE', inCashFlow: true }
  return { bucket: c.bucket, inCashFlow: c.transferKind !== 'INTERNAL' }
}
