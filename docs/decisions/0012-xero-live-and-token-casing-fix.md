# 0012 — Xero live integration + token-lookup casing fix

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (integrations slice)

## Context
Finishing the Xero connection end-to-end. Two blockers surfaced during testing.

## Decisions / fixes
- **Granular scopes.** Apps created on/after 2 Mar 2026 only get Xero's new
  granular scopes; our broad scopes (`accounting.reports.read`,
  `accounting.transactions`) would no longer be granted. Switched the auth URL to
  `accounting.reports.profitandloss.read`, `accounting.reports.balancesheet.read`,
  `accounting.invoices.read` (+ `openid profile email offline_access`), confirmed
  against the app's scope list.
- **Token-lookup casing bug (`refreshToken.ts`).** `getTokenForUser(orgId,
  provider)` queried `findUnique` with the lowercase provider id (`'xero'`) while
  the Prisma enum is uppercase (`XERO`) — Prisma threw "Expected
  IntegrationProvider", the token came back null, the report fetch silently failed,
  and `/pl` fell back to demo. Added a `PROVIDER_ENUM` map and normalize before
  querying. Same bug pattern as the disconnect route (decision 0010); affected
  **QuickBooks live data too**.
- **Refresher dispatch bug.** `REFRESHERS` was keyed lowercase but looked up with
  `integration.provider` (uppercase enum), so auto-refresh never fired. Re-keyed
  the map to the enum values — tokens now refresh ~5 min before expiry.

## Verification
- Standalone `scripts/xero-test.cjs` proved the full path: token valid,
  `/connections` 200 (tenant resolved), `/Reports/ProfitAndLoss` 200, `/Invoices`
  200. After a clean dev restart, `/pl` renders the "Live · Xero" YTD band.
- `eslint` exit 0, `tsc` clean.

## Notes
- A connected **empty** org shows `—`/`$0` (correct — no data). Use Xero's Demo
  Company for populated figures.
- Hot-reload didn't apply the lib fix; a full dev-server restart was required.
