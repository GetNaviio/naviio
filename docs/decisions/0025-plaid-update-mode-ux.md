# 0025 — Plaid update mode UX (reconnect broken Items)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** plaid-specialist + ui-frontend (security-legal flagged the gap)

## Context
The Plaid "Build update mode" checklist exposed that Naviio had the backend half of
update mode (the webhook flags broken Items via `markItemError`, and `createLinkToken`
already issues an update-mode token when an Item is in ERROR) but no user-facing prompt.
Broken connections (`ITEM_LOGIN_REQUIRED`, which happens whenever a user changes their bank
password/MFA) were flagged internally but the user was never told to fix them, so the
dashboard would silently go stale. The status route also only returned CONNECTED items, so an
ERROR item disappeared from the UI entirely.

## Decision
Implement the user-facing update-mode flow: detect → prompt → re-link → auto-dismiss.

## Changes
- **`src/lib/integrations/plaid.ts`** — added `clearItemError(orgId)` (resets PLAID
  ERROR → CONNECTED).
- **`src/app/api/auth/plaid/webhook/route.ts`** — handle the `LOGIN_REPAIRED` ITEM webhook:
  clear the ERROR flag and resync, so an auto-repaired Item dismisses the prompt with no user
  action. (ERROR / PENDING_EXPIRATION / PENDING_DISCONNECT / USER_PERMISSION_REVOKED still set
  ERROR.)
- **`src/app/api/integrations/status/route.ts`** — now returns ERROR-state providers in a
  `reconnect` map (previously ERROR items were omitted), alongside healthy `sources`.
- **`src/app/(dashboard)/integrations/page.tsx`** — amber "Your bank connection needs
  attention" banner when `reconnect.plaid` is set, launching the existing `PlaidLinkButton`
  (which auto-requests an update-mode token because the Item is in ERROR). Cleared on
  successful re-link.

## Maps to Plaid "Build update mode" checklist — all four now done
- Activate entrypoint (detect ITEM_LOGIN_REQUIRED / PENDING_* + update-mode token) — done.
- Create messaging and UI — done (reconnect banner).
- Dismiss prompts on LOGIN_REPAIRED — done (webhook clears + UI clears on success).
- Create prompts for new accounts (NEW_ACCOUNTS_AVAILABLE + account_selection_enabled) —
  **done** (added in the new-accounts pass below).

## New-accounts pass (NEW_ACCOUNTS_AVAILABLE)
- **Schema:** `Integration.newAccountsAvailable Boolean @default(false)` — distinct from
  `status` (item stays CONNECTED). **Requires `npx prisma db push`** to apply + regenerate the
  client (engine download is blocked in the build sandbox, so the field is referenced in code
  but the client isn't yet regenerated there).
- **`plaid.ts`:** `markNewAccountsAvailable` / `clearNewAccountsAvailable`; `createLinkToken`
  takes `accountSelection` → sets `update.account_selection_enabled` (only with an access token).
- **Webhook:** `NEW_ACCOUNTS_AVAILABLE` → `markNewAccountsAvailable`.
- **`create-link-token` route:** accepts `{ accountSelection }`; issues an update-mode token
  (reusing the item's access token) for re-auth (ERROR) OR add-accounts.
- **`/api/auth/plaid/refresh` (new):** update-mode completion has no public token to exchange —
  clears the ERROR + new-accounts flags and resyncs.
- **`PlaidLink.tsx`:** `updateMode` (refresh instead of exchange) + `accountSelection` props.
- **status route + integrations page:** `newAccounts` map → blue "New accounts available" banner
  launching the account-selection update-mode flow; cleared on success.

## Verification
- `npx eslint` (all changed files) — exit 0.
- `npx tsc --noEmit` — clean EXCEPT 4 expected errors on `newAccountsAvailable` (Prisma client
  not regenerated in sandbox). **Action: run `npx prisma db push`** locally to apply the column
  and regenerate the client; tsc then passes (same pattern as the MrrSnapshot field earlier).
