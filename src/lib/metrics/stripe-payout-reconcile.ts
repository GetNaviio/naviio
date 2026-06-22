/**
 * Stripe payout ↔ bank reconciliation (deduplication).
 *
 * A Stripe charge is recognized as revenue when captured. Days later Stripe pays
 * out the batched, fee-netted funds to the connected bank, where Plaid sees a
 * deposit. If that deposit is ALSO counted as revenue, the top line is doubled
 * for exactly the Stripe-heavy startups this product targets.
 *
 * The robust fix is to match each bank CREDIT to a Stripe payout by amount +
 * arrival date and exclude the matched deposit (it's already counted as the
 * underlying charges). This replaces a fragile description regex that both missed
 * real payouts (banks label them inconsistently) and over-excluded unrelated
 * "stripe" credits.
 *
 * Pure + side-effect free so it can be unit tested without a DB or Stripe.
 */

/** A Stripe payout that settled into the bank. amountCents = net payout amount. */
export interface PayoutRef {
  amountCents: number
  arrivalDate: Date
}

/** Marker written onto a reconciled bank credit's category; classify() treats it
 *  as a strong STRIPE_PAYOUT signal (excluded from revenue). */
export const STRIPE_PAYOUT_CATEGORY = 'STRIPE_PAYOUT'

const DAY_MS = 86_400_000

/**
 * Tag each bank (Plaid) CREDIT that matches an unconsumed Stripe payout — same
 * amount (to the cent) and arrival date within ±windowDays — with the
 * STRIPE_PAYOUT category so it's excluded from revenue. One-to-one: each payout
 * is consumed by at most one bank credit (prevents two equal deposits both being
 * dropped by a single payout). Non-Plaid rows and non-credits pass through
 * untouched. Returns a new array; inputs are not mutated.
 */
export function reconcileStripePayouts<
  T extends { source: string; type: string; amount: number; date: Date | string; category?: string | null },
>(txns: T[], payouts: PayoutRef[], windowDays = 4): T[] {
  if (!payouts.length) return txns
  const pool = payouts.map((p) => ({ cents: p.amountCents, t: p.arrivalDate.getTime(), used: false }))

  return txns.map((t) => {
    if (t.source !== 'plaid' || t.type !== 'CREDIT') return t
    const cents = Math.round(t.amount * 100)
    const txMs = (t.date instanceof Date ? t.date : new Date(t.date)).getTime()
    const i = pool.findIndex(
      (p) => !p.used && p.cents === cents && Math.abs(p.t - txMs) <= windowDays * DAY_MS,
    )
    if (i === -1) return t
    pool[i].used = true
    return { ...t, category: STRIPE_PAYOUT_CATEGORY } as T
  })
}
