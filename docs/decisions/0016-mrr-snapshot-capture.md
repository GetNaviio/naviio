# 0016 — MRR snapshot capture (unlocks NRR / waterfall / cohorts)

- **Date:** 2026-06-10
- **Status:** accepted (code complete; needs `prisma db push` to activate)
- **Owner (DRI):** naviio-orchestrator (metrics)

## Context
NRR, the MRR waterfall (new/expansion/contraction/churned), and cohort retention
can't be derived from a single Stripe snapshot — they need per-subscription MRR
**over time**. This is the first piece of the "missing capture" layer.

## Decision
- **Schema**: new `MrrSnapshot` model — one row per (org, subscription, month):
  `period 'YYYY-MM'`, `subscriptionId`, `customerId`, `mrr`, `status`,
  `cohortMonth`. Unique on (orgId, subscriptionId, period).
- **Capture**: `listSubscriptionMrr(orgId)` lists every Stripe subscription
  (paginated — no 100-row cap) and computes per-sub monthly MRR;
  `captureMrrSnapshot(orgId)` upserts the current month's rows (idempotent).
  Wired into `fetchAllData` (Sync Now + nightly cron) for Stripe-connected orgs.
- **Compute** (pure, tested — `src/lib/metrics/mrr.ts`): `mrrWaterfall(prev, curr)`,
  `nrr`, `grr`, `cohortRetention`. 6 assertions green (incl. start+net=end
  reconciliation and NRR-excludes-new).
- **API**: `GET /api/revenue/movement` returns the waterfall + NRR/GRR for the
  latest two periods and full cohort retention; `periods` lets the UI show a
  "building history" state until ≥2 months exist.
- **UI**: Revenue page renders real NRR + waterfall + cohort table once two
  snapshots exist; otherwise keeps the honest "building" placeholder.

## Activation (run on the Mac — engine can't download in the sandbox)
```
cd ~/markup-ai
npx prisma db push      # creates MrrSnapshot in Neon + regenerates the client
```
After this the 7 expected `mrrSnapshot` type errors clear and the feature is live.
NRR/waterfall/cohorts populate after the **second** monthly snapshot.

## Consequences
- Real NRR/waterfall/cohorts accrue from the connection date forward (no
  back-filling possible — Stripe only gives current state).
- Next capture pieces: ad-spend tagging → CAC; AirCheck scoring engine.
