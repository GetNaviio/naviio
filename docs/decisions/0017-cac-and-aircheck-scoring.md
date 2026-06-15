# 0017 — Ad-spend → CAC and the AirCheck scoring engine

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (metrics)

## Context
Finishing the "missing capture" layer: CAC (needed ad-spend tagging) and the
AirCheck health score (needed a real scoring model over the live metrics).

## Decisions
**Ad-spend → CAC (`src/lib/metrics/marketing.ts`, 6 tests).**
`isMarketingSpend` flags ledger expenses from the major ad platforms
(Google/Meta/LinkedIn/TikTok/…) + generic "advertising". `marketingSpend(window)`
sums them. `/api/metrics` now returns this month's S&M spend. KPIs computes, live:
- **CAC** = tagged ad spend ÷ new customers
- **LTV/CAC** = Stripe LTV ÷ CAC
- **Magic Number** = net-new ARR (from the MRR waterfall) ÷ ad spend
These leave the "locked" list automatically once the inputs exist.

**AirCheck scoring engine (`src/lib/metrics/scoring.ts`, 7 tests).**
Six dimensions each scored 0–100 via piecewise-linear benchmark curves from a
real metric, returning `null` (→ "needs data") when the input isn't available:
- Profitability ← net margin · Growth ← MoM MRR growth · Retention ← NRR ·
  Unit Econ ← LTV/CAC · Efficiency ← Magic Number · Liquidity ← runway
  (Infinity ⇒ cash-positive ⇒ strong). Overall = weighted average of the
  available dimensions (re-normalized); letter grade from the overall.
`AirCheck.tsx` rewritten to fetch live data, score, render the hexagon + breakdown
with honest "Needs data" states, and is re-added to the Overview.

## Consequences
- The whole dashboard is now real end to end: no demo financials, and the health
  score is computed, not hardcoded — degrading gracefully as data connects.

## Status
- Activation still pending the `MrrSnapshot` migration (`prisma db push`) for the
  NRR/Growth/Retention dimensions and CAC's Magic Number input.
