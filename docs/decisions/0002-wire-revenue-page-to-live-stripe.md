# 0002 — Wire the Revenue page to live Stripe metrics

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (ui-frontend + stripe-specialist slices)

## Context
Stripe API access was verified live (`stripe-test.cjs` → auth OK on the
`Naviio Inc sandbox` account). But `/revenue` rendered 100% mock data and never
called `/api/stripe/metrics`. This finishes the integration's last gap: showing
real numbers.

## Decision
`src/app/(dashboard)/revenue/page.tsx` is now a client component that fetches
`/api/stripe/metrics` on mount:
- `source === 'stripe'` → top cards (MRR, ARR, churn %, LTV, customers, ARPU)
  render **live** values; a green "Live · Stripe" badge shows.
- otherwise → falls back to the existing mock, badge reads "Demo data".
- The MRR **waterfall** (new/expansion/churned MRR) and the trend deltas show
  "—" when live, because Stripe doesn't expose MRR-movement directly and we have
  no stored history yet. Charts + cohort stay as labeled **sample** when live.

Added `scripts/stripe-seed.cjs` to populate the test account with products,
subscriptions, customers, and charges so the page has real data to show.

`scripts/**` added to ESLint ignores (Node `.cjs` CLI scripts use `require()`).

## Consequences
- The revenue headline metrics are now real when Stripe is connected; trend/
  waterfall remain sample until we persist month-over-month history.
- `liveView()` mapping is the single translation point (StripeMetrics → view).

## Loop / verification
- `revenue/page.tsx` passes ESLint + `tsc --noEmit` (clean).
- ⚠️ Repo-wide: **61 pre-existing ESLint errors in other files** (e.g.
  integrations/page.tsx, other components) — NOT introduced by this change, but
  they WILL fail `next build` (no `eslint.ignoreDuringBuilds` set), blocking a
  production deploy. Tracked as a separate cleanup.

## Follow-ups
- Run `node scripts/stripe-seed.cjs`, then restart dev to see live numbers.
- Dedicated lint-cleanup pass before `next build` / deploy (or set
  `eslint.ignoreDuringBuilds` as a stopgap).
- Build the MRR waterfall properly (needs subscription-event history).
- Add a `liveView` unit test (software-factory: pure mapping deserves a test).
