# 0005 — Stripe metrics work with the env key (no Connect row required)

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** stripe-specialist

## Context
`/revenue` stayed on "Demo data" even with a valid `STRIPE_SECRET_KEY`. Cause:
`getStripeMetrics` → `syncStripeData`, which returned `null` when there was no
Stripe `Integration` row. Using the platform env key (no OAuth connect) means no
row, so metrics never computed → route fell back to mock.

## Decision
Split computation from persistence in `integrations/stripe.ts`:
- `computeStripeMetrics(orgId)` — computes + caches the bundle using
  `getStripeForUser` (which already falls back to the env key). No row required.
- `syncStripeData(orgId)` — persists charges **only when an Integration row
  exists**, stamps it, then computes. Used by webhook + cron.
- `getStripeMetrics(orgId)` — cache → else `computeStripeMetrics` (not sync).

## Consequences
- `/revenue` shows live metrics with just the env key; charge persistence still
  requires a connected-account row (correct — `Transaction.integrationId`).

## Loop / verification
- `eslint` + `tsc` clean on `stripe.ts`. Manual: `/revenue` flips to "Live · Stripe".
