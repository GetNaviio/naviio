# 0006 — Stripe webhook handles own-account (env-key) mode

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** stripe-specialist

## Context
The webhook handler resolved the org via `event.account` (Connect). In env-key /
own-account mode, events have no `account`, so the handler skipped them — webhooks
would verify but never refresh the dashboard.

## Decision
- `handleStripeEvent`: filter to relevant events; if `event.account` resolves an
  org → `syncStripeData(orgId)` (+ alert on cancel); else (platform/own-account)
  → `cache.delPattern('org:*:stripe:metrics')` so dashboards recompute on reload.
- Fixed `cache.delPattern` in-memory branch to support wildcards anywhere in the
  key (was `startsWith(pattern.replace('*',''))`, broken for middle `*`).

## Consequences
- Real-time-ish: a subscription/charge change busts the cached metrics; next
  `/revenue` load recomputes from Stripe. (No browser push; reload to see it.)
- Connect path unchanged.

## Loop / verification
- `eslint` + `tsc` clean. Manual: fire a Stripe test event → `/api/auth/stripe/
  webhook 200` in dev.log → reload `/revenue` shows updated numbers.
