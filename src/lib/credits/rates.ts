/**
 * Credit pricing — the single source of truth for what each metered feature
 * costs and what each purchasable pack grants. Pure; no DB. Keeping rates here
 * lets us tune pricing in one place and unit-test the math.
 */

// Stripe reads cost us nothing (no per-call fee), so a Stripe sync is NOT metered.
// Only features with a real underlying cost are credit-gated.
export type MeteredFeature = 'navi_message' | 'plaid_sync' | 'realtime_refresh' | 'commentary'

/** Credits consumed per use of each metered feature. */
export const FEATURE_COST: Record<MeteredFeature, number> = {
  // Navi message: ~$0.015 (Sonnet 4.6). 1 credit (net ~$0.06-$0.09) is a comfortable margin.
  navi_message: 1,
  plaid_sync: 2,
  // Real-time Plaid refresh: costs us $0.12/call. At 3 credits and a $0.06-$0.10
  // credit value, that's a 33-60% margin across all pack tiers (break-even ≤ 2).
  realtime_refresh: 3,
  // AI commentary writer — a longer Claude generation over the full financials.
  commentary: 2,
}

export function costOf(feature: MeteredFeature): number {
  return FEATURE_COST[feature]
}

/** True when the balance can cover one use of the feature. */
export function hasEnough(balance: number, feature: MeteredFeature): boolean {
  return balance >= costOf(feature)
}

/** A purchasable credit pack. priceCents is charged via Stripe; credits granted on payment. */
export interface CreditPack {
  id: string
  name: string
  credits: number
  priceCents: number
}

// Single reloadable pack: $10 tops up 100 credits. Users re-buy to top up.
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'reload', name: 'Credit reload', credits: 100, priceCents: 1000 },
]

export function packById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id)
}

/** Effective price per credit (cents) for a pack — for showing value/discount. */
export function pricePerCredit(pack: CreditPack): number {
  return pack.credits > 0 ? pack.priceCents / pack.credits : 0
}
