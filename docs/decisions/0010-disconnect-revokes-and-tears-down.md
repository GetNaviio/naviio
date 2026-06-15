# 0010 — Disconnect revokes provider tokens + full local teardown

- **Date:** 2026-06-08
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (data-db + integrations slice)

## Context
`DELETE /api/integrations/disconnect` was broken and unsafe:
- The UI sends a **lowercase** provider id (`quickbooks`), but the DB stores the
  uppercase Prisma enum (`QUICKBOOKS`). The route cast the raw string and called
  `prisma.integration.update`, which **threw P2025** (no matching row) → 500.
  Disconnect never actually worked.
- It nulled only `accessToken`/`refreshToken`, leaving `realmId`, `itemId`,
  `transactionCursor`, `expiresAt` behind (stale, potentially reusable).
- It never revoked anything at the provider — our grant stayed live on their side.

## Decision
- **Normalize + validate** the provider via a lowercase→enum map (400 on unknown).
- **Revoke at the provider first** (best-effort, never blocks): Plaid `itemRemove`,
  Stripe Connect `oauth.deauthorize`, QuickBooks `revoke(refresh_token)`, Xero
  token `revocation`. Each helper lives in its lib and swallows its own errors.
- **Idempotent local teardown** via `updateMany` (no throw when no row): set
  `DISCONNECTED` and null **all** token/cursor/tenant fields.
- **Bust caches** with `delPattern('org:<id>:*')` so dashboard/metrics reflect the
  disconnect immediately.

## Consequences
- Disconnect now succeeds (fixes the casing 500) and is safe to call twice.
- No live tokens remain on the provider side after a disconnect — important since
  these grants reach real bank/payment/accounting data.
- A provider outage degrades gracefully: we still tear down locally.

## Loop / verification
- `eslint` exit 0, `tsc` clean. Manual: connect a sandbox provider, Disconnect,
  confirm row flips to DISCONNECTED with cleared tokens and the card returns to
  the blue Connect button.
