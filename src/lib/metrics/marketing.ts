/**
 * Detect sales & marketing (ad) spend in the transaction ledger so we can derive
 * CAC, LTV/CAC, and the Magic Number. Pure + unit-tested.
 *
 * Detection is merchant/description based — the major ad platforms plus generic
 * "advertising" wording. Conservative on purpose (better to miss a little than to
 * mislabel ordinary spend as marketing).
 */
import { classify, type LedgerTxn } from './classify'
import type { DatedLedgerTxn } from './compute'

// Tightened to avoid false positives: ambiguous platforms (LinkedIn/TikTok/Meta)
// require an "ads"/"marketing" qualifier, and word boundaries prevent matches
// like "metal" or "metabase".
const AD_PATTERNS: RegExp[] = [
  /google\s*ads|adwords/i,
  /facebook|fb\s*ads|\bmeta\s*(platforms|ads)\b|instagram\s*ads/i,
  /linkedin\s*(ads|marketing)/i,
  /tiktok\s*ads/i,
  /twitter\s*ads|\bx\s*ads\b/i,
  /microsoft\s*advertis|bing\s*ads/i,
  /reddit\s*ads/i,
  /snapchat\s*ads/i,
  /advertising|\bad\s*spend\b|\bads?\s*campaign\b/i,
]

export function isMarketingSpend(t: LedgerTxn): boolean {
  const text = `${t.description ?? ''} ${t.merchantName ?? ''}`
  return AD_PATTERNS.some((re) => re.test(text))
}

const inWindow = (d: Date | string, from?: Date, to?: Date) => {
  const t = (typeof d === 'string' ? new Date(d) : d).getTime()
  if (from && t < from.getTime()) return false
  if (to && t > to.getTime()) return false
  return true
}

/** Total sales & marketing (ad) spend over an optional window. */
export function marketingSpend(txns: DatedLedgerTxn[], from?: Date, to?: Date): number {
  let total = 0
  for (const t of txns) {
    if (!inWindow(t.date, from, to)) continue
    // Only real outgoing expenses (excludes transfers/payouts), and only ad spend.
    if (classify(t).bucket !== 'EXPENSE') continue
    if (isMarketingSpend(t)) total += t.amount
  }
  return Math.round(total * 100) / 100
}

/** CAC = marketing spend ÷ new customers. Null when there are no new customers. */
export function cac(marketing: number, newCustomers: number): number | null {
  if (newCustomers <= 0) return null
  return Math.round((marketing / newCustomers) * 100) / 100
}

/** Magic Number = net-new ARR ÷ marketing spend. Null without marketing spend. */
export function magicNumber(netNewArr: number, marketing: number): number | null {
  if (marketing <= 0) return null
  return Math.round((netNewArr / marketing) * 100) / 100
}
