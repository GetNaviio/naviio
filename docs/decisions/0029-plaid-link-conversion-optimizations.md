# 0029 — Plaid Link conversion optimizations

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** plaid-specialist + ui-frontend

## Context
Plaid "Link conversion optimizations" checklist. Most items were already satisfied or N/A for
a Transactions-only app (Customize Link flow = done; multi-product optimization = N/A, single
product; Embedded Institution Search = pay-by-bank only). Two were genuine, optional levers:
own-funnel conversion logging, and Link UI benefit messaging.

## Changes
- **Link conversion logging** — `POST /api/analytics/link-event` (auth'd) logs each Plaid Link
  `onEvent` as a structured funnel record (no financial PII — event/view names, institution id,
  link_session_id, error codes). `PlaidLink.tsx` posts every event fire-and-forget (`keepalive`,
  fully swallowed so analytics can never break the Link flow). Complements Plaid's built-in
  Link Analytics with our own drop-off funnel.
- **Link UI best practice** — the Plaid integration card copy now explains the *benefit* of
  connecting ("see your real-time P&L, cash flow, and runway") and reassures on security
  ("bank-grade, read-only via Plaid — your banking login is never shared").

## Verification
- `npx eslint` (changed files) — 0.
- `npx tsc --noEmit` — no errors in the changed files (only the pre-existing
  `deletedAt` / `newAccountsAvailable` errors pending `npx prisma db push`).

## Not done (intentional / N/A)
- Multi-product optimization — single product (Transactions); already optimal.
- Embedded Institution Search — pay-by-bank only; Naviio does not move money.
