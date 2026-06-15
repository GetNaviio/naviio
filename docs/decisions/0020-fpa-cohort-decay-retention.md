# 0020 — FP&A: cohort-decay existing-base retention (pass 2)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** fpa-specialist

## Context
Pass 1 (0019) projected the existing base with a single blended churn rate
(derived from the last-period waterfall). But older cohorts retain differently
from cohorts acquired last month — a blended rate misprices a base whose cohort
mix is shifting. We already compute real per-cohort retention
(`cohortRetention` → `/api/revenue/movement` `cohorts`); we should age the base
on it.

## Decision
Roll the installed base forward on an **empirical retention curve** and layer new
acquisition on top as fresh cohorts:

- **Derive the curve by age.** At each offset, blended retention =
  `Σ mrr(cohort, offset) / Σ base(cohort that reached offset)` (exposure-weighted,
  so young cohorts don't drag the tail). Convert the cumulative curve into
  per-step survival rates `r[age] = retention[age+1] / retention[age]`, clamped to
  `[0, 1]`. Sparse ages fall back to the last known step (or a provided default).
- **Project.** Each existing cohort continues aging from its CURRENT age (its
  latest observed offset). Each forecast month spawns a new age-0 cohort = that
  month's new MRR, which then decays on the same curve. New MRR stays an absolute
  growing at `newMrrGrowthRate` (acquisition output, not base-proportional — same
  stance as pass 1).
- **Expansion without double-counting.** The survival curve is observed cumulative
  retention, so it already nets out churn AND contraction. Expansion is therefore
  NOT folded into the curve; it is applied as a separate gross rate on the
  start-of-month installed base (pass-1 `expansionRate`) and tracked as its own
  age-0 cohort so upsell MRR also decays going forward.
- **Scenarios.** Bear/base/bull tilt the per-step LOSS `(1 − r)` by
  `churnMultiplier` and new-MRR by `growthMultiplier`, consistent with pass 1.

## Implementation
- `src/lib/forecasting/cohorts.ts` (new, pure): `deriveRetentionCurve`,
  `tiltCurve`, `projectCohortSeries`, `projectCohortSeriesWithExpansion`,
  `hasSufficientCohortData`, types `CohortSeries` / `RetentionCurve`.
- `engine.ts`: `ForecastAnchor.cohorts?: CohortSeries[]`. The cohort path activates
  ONLY when `hasSufficientCohortData` (≥1 cohort with an offset≥1 point) AND a
  waterfall is present (to seed new-MRR/expansion). It feeds `projectScenario` a
  precomputed `cohortMrrSeries`, which takes priority over the flat-driver series,
  which takes priority over single-rate compounding. **`generateForecast`
  signature + `ForecastResult` shape unchanged.**
- `forecast/page.tsx`: reads `cohorts` from `/api/revenue/movement`, passes them in
  the anchor; the engine self-gates. Assumptions note switches to "cohort-decay
  retention from your actual cohorts" when active. No demo data.
- `tests/lib/forecast-cohorts.test.ts` (29 assertions): per-step conversion,
  clamp [0,1], exposure-weighted blend, sparse fallback, single-cohort exact
  decay, monotonic shrink with no new MRR, flat-curve reconciliation with pass-1
  flat churn, expansion-without-double-count, scenario tilt. Jest's SWC won't load
  in the sandbox, so the pure module was compiled standalone and the assertions
  run in node (as pass 1 did): 29/29. `eslint` exit 0, `tsc` 0 errors.

## Consequences
- The base-case existing-base projection now ages each cohort on its real
  retention curve instead of one blended churn rate — materially more accurate for
  a base with a shifting cohort mix. Falls back cleanly to pass-1 drivers, then to
  compounding, when data is thin.

## Next FP&A passes
1. **Opex/headcount drivers** — tie S&M to projected new logos via CAC; replace
   flat opex growth.
2. **Persisted scenarios + forecast snapshots** → variance / reforecasting
   (needs a Prisma schema change — deferred).
