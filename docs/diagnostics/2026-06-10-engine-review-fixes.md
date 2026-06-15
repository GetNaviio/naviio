# Engine review — verification & fixes (2026-06-10)

A read-only review agent audited the new metric engine, MRR-snapshot capture,
ad-spend/CAC, and AirCheck scoring. Findings and what was fixed.

## Fixed (wrong-number bugs)

- **Stripe 100-record pagination cap (Critical)** — `fetchMRR`, `getChurnRate`,
  `getCustomerMetrics`, `getRevenueByMonth`, `fetchRevenue`, `getRefundRate`,
  `fetchChurn` summed only the first 100 rows → understated MRR/ARR/customers/
  churn/revenue for any account with >100 records. All now use Stripe's
  `for await … of list(...)` auto-pagination.
- **`interval_count` ignored (High)** — MRR treated quarterly/biennial/weekly
  plans wrong (e.g. a plan billed every 3 months counted at 3×). `subscriptionMrr`
  now normalizes by interval **and** interval_count (week/day too). Verified:
  quarterly $900 → $300/mo, annual $3,600 → $300/mo, 2-yr $7,200 → $300/mo.
- **Churned subs inflated NRR / cohorts (High)** — `subscriptionMrr` returned the
  list price even for canceled subs. Now returns **0** for non-paying statuses
  (only `active`/`past_due` count), and the movement route treats a row that
  dropped to 0 MRR as **churned**. NRR/waterfall/cohort retention now reflect real
  churn.
- **CAC timezone mismatch (High)** — `getCustomerMetrics` used server-local month
  start while marketing spend used UTC → CAC numerator/denominator covered
  different windows near month boundaries. Now UTC.
- **Marketing false positives (Medium)** — tightened ad-spend patterns: bare
  `meta` no longer matches "metal"; LinkedIn/TikTok now require an "ads"/
  "marketing" qualifier (a LinkedIn Premium sub is no longer counted as ad spend).
- **"Cash positive ∞" when cash is merely unknown (Medium)** — Cash Flow runway
  card now distinguishes "cash balance unavailable" (—) from genuinely
  cash-positive (∞).
- **Forecast leaked demo data (Critical)** — growth-rate default and the
  revenue/MRR + opex-growth ratios were derived from mock history and flowed into
  "live" projections. Live mode now uses a neutral default growth (3%, user-
  adjustable), `revenueToMrr = 1`, and opex growth tied to the assumed rate — no
  demo constants in a connected customer's forecast.

## Noted, not changed (acceptable / lower risk)
- **Stripe-payout dedup** relies on "stripe"/"payout" appearing in the bank
  descriptor. If a payout descriptor lacks those tokens it could be double-counted
  as revenue. Hard to fully solve without reconciling against Stripe payout
  objects — flagged for a future reconciliation pass.
- **Invalid Date** from malformed QBO/Xero rows would create a junk month bucket
  (accounting-fallback only, malformed-row only). Low likelihood.

## Confirmed correct
`primaryLedger` dedup (Plaid/Stripe vs accounting), money units (cents vs major),
UTC YTD boundaries, MrrSnapshot upsert key, scoring band monotonicity +
`overallScore` re-normalization, and connect-prompt/"needs data" gating on every
page (no page falls back to demo data after the Forecast fix).

## Gates
`eslint` exit 0. `tsc` clean except the 7 expected `mrrSnapshot` errors that clear
after `prisma db push`. Pure-logic checks: marketing 7/7, interval/status MRR 5/5,
plus the existing engine/mrr/scoring suites.
