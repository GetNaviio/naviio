# 0021 — FP&A: driver-based opex (S&M tied to new logos × CAC, pass 3)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** fpa-specialist

## Context
Passes 1–2 (0019, 0020) made the MRR line driver-based (real waterfall) then
cohort-decay. But opex was still a single flat growth rate: `curOpex × (1 + opexG)`.
That lets a forecast assume growth the acquisition spend can't fund — the
sales & marketing line didn't move when the projection added more new logos. FP&A
best practice is **unit-economics-constrained growth**: tie acquisition spend to
the new logos you're projecting.

## Decision
Split projected opex into two streams:

```
otherOpex[t] = startOtherOpex × (1 + otherOpexGrowthRate)^t     (payroll/G&A/infra)
sAndM[t]     = (newMrr[t] / ARPU) × CAC                          (cost of new logos)
opex[t]      = otherOpex[t] + sAndM[t]
```

- **Other opex** (payroll/G&A/infra) keeps today's behavior — compounds at the
  base opex growth rate.
- **S&M is DRIVEN** by each month's projected new logos × CAC, where new logos =
  that month's NEW-logo MRR ÷ ARPU. The new-MRR stream is the SAME one the MRR
  paths spawn each month (`newMrr × (1 + newMrrGrowthRate)^t`, tilted by
  `growthMultiplier`) — ONE source of truth, so MRR growth and the S&M that funds
  it always agree.
- **Split current opex:** `startOtherOpex = max(startOpex − currentMarketingSpend, 0)`
  carves this month's marketing out of the starting opex so S&M isn't
  double-counted when it's layered back on per month.
- **ARPU = 0 guard:** without ARPU we can't convert new MRR into a logo count, so
  S&M contributes **0 incremental** and opex falls back to pure other-opex growth
  (documented choice). CAC ≤ 0 likewise yields no S&M; negative monthly new MRR is
  floored to 0 logos.
- **Scenarios.** S&M moves automatically because new MRR is tilted by
  `growthMultiplier`. CAC is additionally tilted by `churnMultiplier` (bear =
  weaker funnel = higher CAC, bull = lower). Net effect: bull funds MORE growth in
  absolute S&M dollars (more logos) even at a lower cost per logo — the loop is
  honest about the cost of acquisition.

## Implementation
- `src/lib/forecasting/opex.ts` (new, pure): `projectOpexSeries`,
  `startOtherOpex`, type `OpexSeriesInput`.
- `src/lib/forecasting/drivers.ts`: `newMrrSeriesFrom(newMrr, growth, horizon)` —
  the single source of truth for the per-month new-logo MRR stream the opex model
  consumes (same stream the flat-driver/cohort paths spawn).
- `engine.ts`: `ForecastAnchor.opexDrivers?: { cac, arpu, currentMarketingSpend }`.
  `projectScenario` builds opex via `projectOpexSeries` from the scenario's tilted
  new-MRR series when opex drivers are present (and a waterfall exists to seed the
  stream); otherwise the flat `(1 + opexG)` compounding is unchanged.
  **`generateForecast` signature + `ForecastResult` shape unchanged** —
  `buildSummary` already derives burn/runway from revenue − opex, so it now
  reflects acquisition-driven opex with no page changes needed for it.
- `forecast/page.tsx`: derives `cac = marketing.thisMonth ÷ customers.newThisMonth`
  (when newThisMonth > 0) and `arpu = mrr ÷ customers.total` (when total > 0) from
  the already-fetched `/api/metrics` + `/api/stripe/metrics`, and passes
  `opexDrivers` in the anchor when both are > 0. Assumptions note switches to
  "opex is S&M driven by your CAC × projected new customers" when active. Falls
  back cleanly to flat opex when CAC/ARPU aren't available. No demo data.
- Tests: `tests/lib/forecast-opex.test.ts` (S&M linear in new MRR and CAC, other
  opex compounds, ARPU=0 guard, CAC≤0 guard, negative-new-MRR floor, no-new-MRR
  reconciles to pure other-opex growth) + `forecast-drivers.test.ts` extended for
  `newMrrSeriesFrom`. Jest's SWC won't load in the sandbox, so the pure modules
  were compiled standalone and assertions run in node (as passes 1–2 did): 18/18,
  plus a standalone engine-integration check (bear/base/bull S&M, ARPU=0 fallback)
  reproducing the expected opex split. `eslint` exit 0, `tsc` 0 errors.

## Consequences
- Burn and runway now reflect the cost of the growth the forecast assumes: spend
  scales with the new logos, not a flat %. A bull case that adds more logos now
  shows the higher S&M needed to win them. Falls back to flat opex when CAC/ARPU
  are thin — preserving every prior fallback (cohort → flat-driver → compounding
  for MRR; flat opex for opex).

## Loop / verification
- Gates: `eslint` exit 0, `tsc` 0 errors, opex/driver assertions 18/18 standalone,
  engine-integration smoke check passing.

## Next FP&A passes
1. **Persisted scenarios + forecast snapshots** → variance / reforecasting:
   store user scenarios (DB + orgId scope, replacing the in-memory store) and
   periodic forecast snapshots so we can compare projected vs actual and surface
   drift. **Needs a Prisma schema change** (new models, `prisma db push`) — out of
   scope for this pure-math/wiring pass, deferred to the next.
