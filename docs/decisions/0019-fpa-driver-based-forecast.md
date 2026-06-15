# 0019 — FP&A: driver-based MRR forecast (pass 1)

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** fpa-specialist

## Context
The forecast projected MRR with naive single-rate net compounding
(`MRR × (1 + growth − churn)`). FP&A best practice is **driver-based**: model the
growth engine from the components, seeded from the customer's real data.

## Decision
Project the MRR line from drivers instead of one net rate:

```
nextBase = base × (1 − churnRate − contractionRate + expansionRate) + newMrr
```

- Expansion / contraction / churn are **base-proportional rates** (they act on
  installed accounts); **new-logo MRR is an absolute** seeded from last period's
  `newMrr`, growing at an assumed rate (acquisition is a function of the sales
  motion, not base size). Loss is capped so MRR can't go negative.
- `deriveDrivers(waterfall, tilt)` turns the customer's **real** last-period
  movement (`Waterfall` from the `MrrSnapshot` history via `/api/revenue/movement`)
  into monthly rates; at neutral tilt it exactly reproduces the observed movement.
  Bear/base/bull apply the existing growth/churn multipliers.

## Implementation
- `src/lib/forecasting/drivers.ts` (new, pure): `projectDriverMonth`,
  `projectDriverSeries`, `deriveDrivers`, types `MrrDrivers` / `ScenarioTilt`.
- `engine.ts`: `ForecastAnchor.drivers?: Waterfall`; `projectScenario` uses the
  driver series for MRR when drivers are present, else the existing compounding.
  **Signature + `ForecastResult` shape unchanged** — page/chart untouched.
- `forecast/page.tsx`: fetches `/api/revenue/movement` and passes the real
  waterfall as `drivers` when `startMrr > 0`; falls back to the sliders when there
  are <2 MRR snapshots. No demo data.
- `tests/lib/forecast-drivers.test.ts` (13 assertions). Verified standalone 5/5 +
  the suite; `eslint` exit 0, `tsc` 0 errors.

## Consequences
- A customer's base-case projection now reflects their actual new/expansion/churn
  split, not a single assumed rate — materially better for SaaS.

## Next FP&A passes
1. **Cohort-decay existing-base** — roll the base on real per-cohort retention
   curves (we already compute `cohorts`) instead of one blended churn rate.
2. **Opex/headcount drivers** — tie S&M to projected new logos via CAC; replace
   flat opex growth.
3. **Persisted scenarios + forecast snapshots** → variance / reforecasting
   (needs a Prisma schema change — deferred).
