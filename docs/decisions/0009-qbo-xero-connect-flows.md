# 0009 — QuickBooks + Xero connect flows (OAuth) hardened

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (data-db + ui slices)

## Context
Both accounting integrations had solid canonical libs + auth routes but were
unconfigured, and QuickBooks carried a dead duplicate (`lib/quickbooks.ts` +
`/api/quickbooks/*`). Goal: get the OAuth connect flow solid for both; data
display deferred.

## Decision
- Removed the dead QuickBooks duplicate (consolidated on
  `integrations/quickbooks.ts` + `/api/auth/quickbooks/*`).
- Hardened both OAuth flows like Stripe: a `client_id`-missing guard on the GET
  routes (clean redirect instead of a broken authorize URL), state-parse guards
  on the callbacks, and response-body surfacing on Xero's token-exchange failure.
- Xero callback now **persists the tenant id** (`realmId`) — Xero requires it on
  every API call.
- Scaffolded `.env` with `QB_*` / `XERO_*` and the ngrok redirect URIs.

## Consequences
- Connect → authorize → callback stores tokens (+ refresh, expiry, realm/tenant);
  `refreshToken.ts` already refreshes QBO + Xero tokens before expiry.
- Both use **read-only accounting scopes** — no payments, no platform agreement.

## Status / open
- Needs Intuit + Xero developer apps (client_id/secret + redirect URIs) to test.
- Data display (P&L, expenses, balance sheet) on the dashboard is **deferred** to
  a later pass.

## Loop / verification
- `eslint` exit 0, `tsc` clean. Manual connect test pending dev-app credentials.
