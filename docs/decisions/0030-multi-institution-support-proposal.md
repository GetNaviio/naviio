# 0030 — Multi-institution (multiple banks per org) — DESIGN PROPOSAL

- **Date:** 2026-06-09
- **Status:** **proposed** (not yet implemented — awaiting go/approach decision)
- **Owner (DRI):** plaid-specialist + data-db + ui-frontend

## Problem
Today Naviio stores exactly one Plaid Item per org (`Integration @@unique([orgId, provider])`).
Connecting a second institution (e.g. Chase **and** Bank of America) overwrites the first.
Businesses routinely bank across multiple institutions, so this caps the product.

## What already works (no change needed)
The **analytics layer is already multi-institution-ready.** Transactions carry `integrationId`
and the metric engine aggregates by `orgId`, so multiple Items' transactions combine into one
org ledger / P&L / cash-flow automatically. Webhooks are already routed by `item_id`
(`getOrgIdByItemId`). The change is confined to the connection/sync/UI layer.

## Blast radius (one-Item-per-org assumptions to undo)
All in `src/lib/integrations/plaid.ts` + routes:
- `createLinkToken` / `exchangePublicToken` — read/upsert by `orgId_provider` (one row).
- `syncTransactions(orgId)` — one token + one cursor per org.
- `fetchBalances` / `getCashBalance` — one token per org.
- `markItemError` / `clearItemError` / `offboardPlaidItem` / `markNewAccountsAvailable` —
  `updateMany` by `orgId, provider` (would hit ALL Items; must become per-Item).
- duplicate detection (0028) — currently removes any prior Item; must allow different
  institutions to coexist and only supersede the SAME institution.
- status route + integrations UI — render a single Plaid card; must become a list.
- disconnect route — disconnects "plaid" wholesale; must be per-Item.

## Approach options

**Option A — relax `Integration` uniqueness (in place).**
Drop `@@unique([orgId, provider])`, key Plaid by `itemId`. *Downside:* that compound key is the
`orgId_provider` upsert target for **all 7 other integrations** (Stripe, QBO, Xero, Gusto, ADP,
Shopify, GHL) — every one would need to stop using `upsert({ where: { orgId_provider }})` and
move to find-then-create. Spreads risk across integrations that don't need to change.

**Option B (recommended) — dedicated `PlaidItem` model.**
Add a `PlaidItem` table (orgId, itemId @unique, accessToken (encrypted), transactionCursor,
status, institutionId, institutionName, newAccountsAvailable, lastSyncedAt). Move Plaid off the
generic `Integration` row; point `Transaction.plaidItemId` at it. Plaid code targets `PlaidItem`;
the 7 other integrations stay exactly as they are. Isolates the entire change to Plaid + a
one-time migration of existing Plaid rows.

## Recommended plan (Option B), phased
1. **Schema:** `PlaidItem` model + `Transaction.plaidItemId`; migrate existing PLAID
   `Integration` rows → `PlaidItem`; backfill `institutionId/Name` (from `/item/get` +
   `/institutions/get_by_id`). (`prisma db push` / migration — run locally.)
2. **Plaid lib:** make every helper Item-scoped (`syncItem(itemId)`, `fetchBalances(orgId)`
   loops all Items and aggregates, mark/clear/offboard by `itemId`). Capture `institution_id`
   at `exchangePublicToken`.
3. **Connect flows:** "Connect another bank" (fresh Item) vs per-Item reconnect / add-accounts
   (targeted `itemId`). Duplicate detection → supersede only the same `institution_id`.
4. **Status route + UI:** list connected institutions under Plaid, each with its own
   status / reconnect / add-accounts / disconnect, plus "Connect another bank."
5. **Disconnect + cron + webhook:** per-Item disconnect; cron iterates all Items; webhook
   mark/clear/offboard target the Item by `item_id`.
6. **Gates + tests + decision log.**

## Effort / risk
Medium-large, multi-file, touches the live banking connection path. **Recommend building on an
isolated branch/worktree**, not incrementally on the working tree, and testing the migration on
a copy first. Analytics/metrics need no changes, which de-risks it considerably.

## Decision needed
1. Approve **Option B** (dedicated `PlaidItem`) vs Option A (relax `Integration`)?
2. Build now (on a worktree) or schedule after the current Plaid go-live?
