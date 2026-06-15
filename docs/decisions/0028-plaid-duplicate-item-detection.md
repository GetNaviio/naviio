# 0028 — Plaid duplicate / orphan Item detection

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** plaid-specialist

## Context
Plaid's "Duplicate Items" optimization: reduce user confusion and manage costs by detecting
duplicate Items. Naviio keeps exactly one Plaid Integration row per org
(`@@unique([orgId, provider])`), so a reconnect upserts and overwrites the stored token — it
never stores a duplicate. **But** the previous Plaid Item was left orphaned at Plaid (its
token discarded without `/item/remove`), so it kept existing and billing.

## Decision
On `exchangePublicToken`, before overwriting an existing Plaid Item with a **different**
`item_id`, call `/item/remove` on the prior access token. Reconnecting the same Item
(same `item_id`) is a no-op. This guarantees one live Item per org and removes the superseded
Item at Plaid to control cost.

## Change
- `src/lib/integrations/plaid.ts` `exchangePublicToken` — look up the prior Plaid integration;
  if `prior.itemId !== itemId`, `itemRemove(prior.accessToken)` (best-effort, non-blocking)
  before the upsert. The prior token is decrypted transparently by the Prisma extension (0027).

## Verification
- `npx eslint src/lib/integrations/plaid.ts` — 0.
- `npx tsc --noEmit` — no new errors (only the pre-existing `newAccountsAvailable` /
  `deletedAt` errors pending `npx prisma db push`).

## Known limitation (not addressed here)
The one-Plaid-Item-per-org model means connecting a **second institution** (e.g. Chase *and*
Bank of America) overwrites the first rather than holding both. True multi-institution support
is a separate data-model change (drop the org+provider uniqueness for Plaid, key Items by
`itemId`) and is out of scope for this duplicate-detection fix.
