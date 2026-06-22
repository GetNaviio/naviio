# 0058 — Churn metric & forecast reconciliation

## Context
A user saw the "Churn Rate" card at **100.00%** while the revenue **forecast still
projected growth** — a cross-surface contradiction. Two root causes (confirmed by
a senior-controller review):
1. The card showed **logo churn** from a separate Stripe roster call, while the
   adjacent NRR/GRR/waterfall are all **revenue** churn — different unit, timing,
   and machinery. With tiny/dummy data the logo base collapsed and the ratio
   saturated at 100%.
2. The forecast never consumed live churn — it seeded from a hardcoded
   `BASE_CHURN_RATE = 0.03`, so it compounded growth regardless of the card.

## Decision (per the controller review)

1. **Headline churn = gross MRR churn**, from the waterfall we already compute:
   `grossMrrChurnRate = churnedMrr / startMrr` (cancellation only; downgrades shown
   as a separate "contraction" subtitle). It reconciles to GRR
   (`GRR = 100 − grossMrrChurn − contraction`) and to the forecast. Logo churn is
   retired from the headline. Until two MRR snapshots exist the card shows
   "Building history" instead of a logo fallback.

2. **Suppress degenerate churn.** `logoChurnRate` now returns **null** when the
   start-of-window base < `MIN_CHURN_BASE` (10) or there are no active subs — so
   both the 100% and 0% tails are suppressed rather than shown as confident
   numbers. `StripeMetrics.churnRate` and the card stop coercing null→0%. This also
   fixes `getLTV` (it already guards a null/zero churn).

3. **LTV uses the same (revenue) churn** as the card, so a viewer can reproduce it
   from the numbers on screen. Falls back to the server logo-based LTV only before
   any history exists.

4. **Forecast seeds churn from live history, clamped.** `/api/revenue/movement`
   now returns `trailingChurn` = a 3-month trailing average of gross MRR churn
   (a single period is too noisy). The forecast page seeds its churn assumption
   from it (clamped ≤ 25% so a degenerate measurement can't poison the projection)
   instead of the 3% default; the slider is labeled "(from your data)" vs
   "(assumed)". When the driver/cohort path is active the engine derives churn from
   real movement, so the slider is shown **inactive** with the derived value rather
   than pretending to control anything.

5. **Reconcile the stragglers.** `getCustomerMetrics` now counts churn by
   `canceled_at`/`ended_at` (not `created`, which undercounts). The dead
   `/api/forecast` GET route (zero-anchored, unused) was deleted.

## Why this is robust
- One churn definition (revenue) across the card, NRR, GRR, LTV, and the forecast.
- The degenerate suppression is symmetric (kills both 100% and 0% at tiny n).
- The forecast is anchored to smoothed real churn, not a guess and not one noisy
  period; the cohort-decay path (already built) remains the highest-fidelity seed.

## Tests
`tests/lib/mrr.test.ts` (grossMrrChurnRate / contractionRate / GRR reconciliation /
trailingGrossMrrChurn) and `tests/lib/stripe-metrics.test.ts` (logoChurnRate
suppression: base < 10, tiny-saturation, no-active → null). Pure helpers also
verified via ts-node.
