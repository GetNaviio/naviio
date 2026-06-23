/**
 * Business-type (industry) model + inference.
 *
 * Naviio serves any industry, not just SaaS. The industry decides WHICH metrics
 * are relevant (the metric registry gates on it) and which benchmarks the Navi
 * score uses. It's set explicitly by the owner (an onboarding question), but we
 * INFER a suggestion from the transaction mix so the answer is pre-filled and we
 * can flag drift. Pure + side-effect free so the inference is unit-tested.
 */
import type { LedgerTxn } from './classify'

export type Industry =
  | 'saas'
  | 'ecommerce'
  | 'restaurant'
  | 'agency'
  | 'proservices'
  | 'trades'
  | 'manufacturing'
  | 'healthcare'
  | 'realestate'
  | 'nonprofit'
  | 'generic'

export const INDUSTRIES: { id: Industry; label: string; blurb: string }[] = [
  { id: 'saas', label: 'SaaS / Subscription', blurb: 'Recurring software or membership revenue' },
  { id: 'ecommerce', label: 'E-commerce / Retail', blurb: 'Selling physical or digital goods' },
  { id: 'restaurant', label: 'Restaurant / Hospitality', blurb: 'Food, beverage, and hospitality' },
  { id: 'agency', label: 'Marketing / Creative Agency', blurb: 'Marketing, creative, and freelance services' },
  { id: 'proservices', label: 'Professional Services', blurb: 'Law, accounting, consulting, and advisory firms' },
  { id: 'trades', label: 'Trades / Construction', blurb: 'Contracting, field, and project work' },
  { id: 'manufacturing', label: 'Manufacturing / Distribution', blurb: 'Producing or distributing goods' },
  { id: 'healthcare', label: 'Healthcare Practice', blurb: 'Clinics, providers, and practices' },
  { id: 'realestate', label: 'Real Estate / Property', blurb: 'Property management, rentals, and investing' },
  { id: 'nonprofit', label: 'Nonprofit / Foundation', blurb: 'Grants, donations, and program funding' },
  { id: 'generic', label: 'Other / General', blurb: 'A general business P&L' },
]

const LABELS = new Map(INDUSTRIES.map((i) => [i.id, i.label]))
export const industryLabel = (id: Industry | null | undefined): string =>
  (id && LABELS.get(id)) || 'Other / General'

// Merchant/description signals per industry. Each hit is a weak vote; the mix
// across the ledger decides. Deliberately high-precision tokens (recognizable
// vendors/keywords) so a single stray transaction doesn't flip the inference.
const SIGNALS: Record<Exclude<Industry, 'generic'>, RegExp> = {
  saas: /\b(stripe|recurly|chargebee|aws|amazon web services|gcp|google cloud|\bazure\b|vercel|heroku|datadog|github|atlassian|saas|subscription)\b/i,
  ecommerce: /\b(shopify|woocommerce|bigcommerce|amazon(?!\s*web)|ebay|etsy|shipstation|shippo|easypost|usps|ups|fedex|dhl|fulfillment|3pl|warehouse|inventory)\b/i,
  restaurant: /\b(sysco|us ?foods|restaurant depot|gordon food|toast|doordash|ubereats|uber eats|grubhub|opentable|resy|food ?service|produce|beverage|brewery|catering)\b/i,
  agency: /\b(upwork|fiverr|freelanc|creative|adobe creative|figma|canva|design studio|marketing agency|\bad agency\b|media buy)\b/i,
  proservices: /\b(law firm|attorney|\blegal\b|paralegal|\bllp\b|accounting firm|\bcpa\b|bookkeep|consult|advisory|clio|lawpay|mycase|engagement letter|billable hour|retainer)\b/i,
  trades: /\b(home depot|lowe'?s|ferguson|lumber|building material|concrete|hvac|plumbing|electrical|subcontractor|sub-?contractor|job site|equipment rental)\b/i,
  manufacturing: /\b(manufactur|fabrication|machining|machine shop|cnc|tooling|assembly|industrial supply|mcmaster|grainger|raw material|bill of materials|\bbom\b|injection mold|foundry|oem|pallet|distribution center)\b/i,
  healthcare: /\b(medicaid|medicare|blue cross|aetna|cigna|unitedhealth|copay|co-pay|patient|clinic|dental|provider|practice management|athenahealth|epic systems)\b/i,
  realestate: /\b(property management|rent roll|tenant|landlord|\bhoa\b|appfolio|buildium|yardi|realtor|brokerage|escrow|title company|leasing office|property tax|cap rate)\b/i,
  nonprofit: /\b(grant|donation|donor|\b501c3\b|501\(c\)|nonprofit|non-profit|foundation|pledge|endowment|fundrais|charitable|blackbaud|donorperfect|bloomerang|givebutter)\b/i,
}

export interface IndustryInference {
  industry: Industry
  confidence: number // 0–1; 0 when nothing matched
  /** Per-industry signal counts, for transparency/debugging. */
  votes: Partial<Record<Industry, number>>
}

/**
 * Infer the most likely industry from the transaction ledger. `hasSubscriptions`
 * (live Stripe subscriptions / MRR) is a strong SaaS prior. Returns 'generic'
 * with confidence 0 when there isn't enough signal — the UI should ask rather
 * than guess. Never silently overrides an explicit owner choice (that's the
 * caller's job).
 */
export function inferIndustry(txns: LedgerTxn[], hasSubscriptions = false): IndustryInference {
  const votes: Partial<Record<Industry, number>> = {}
  for (const t of txns) {
    const text = `${t.description ?? ''} ${t.merchantName ?? ''}`
    for (const [ind, re] of Object.entries(SIGNALS) as [Exclude<Industry, 'generic'>, RegExp][]) {
      if (re.test(text)) votes[ind] = (votes[ind] ?? 0) + 1
    }
  }
  // Recurring subscription revenue is a strong SaaS signal on its own.
  if (hasSubscriptions) votes.saas = (votes.saas ?? 0) + 5

  const ranked = (Object.entries(votes) as [Industry, number][]).sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { industry: 'generic', confidence: 0, votes }

  const [topInd, topVotes] = ranked[0]
  const total = ranked.reduce((s, [, v]) => s + v, 0)
  // Confidence = share of votes the leader holds, dampened by how thin the
  // evidence is (few total hits → low confidence even if unanimous).
  const share = topVotes / total
  const evidence = Math.min(total / 8, 1) // saturates at ~8 signal hits
  return { industry: topInd, confidence: Math.round(share * evidence * 100) / 100, votes }
}

/** Whether SaaS-only metrics (MRR/NRR/churn/LTV-CAC) apply to this industry. */
export const isRecurringRevenue = (industry: Industry | null | undefined): boolean =>
  industry === 'saas'
