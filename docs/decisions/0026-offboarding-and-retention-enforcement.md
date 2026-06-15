# 0026 — User offboarding + data-retention enforcement (Plaid + SEC-POL-003)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist + plaid-specialist + data-db

## Context
Plaid's "User offboarding" checklist plus a security-legal review found that
`docs/security/data-retention-disposal-policy.md` (SEC-POL-003) **promised mechanisms that
did not exist in code**: an in-app account-deletion feature (§5.1) and automated nightly
purge jobs (§4). `/item/remove` existed (disconnect), but `USER_ACCOUNT_REVOKED` (Chase) was
unhandled and revocations were treated as fixable errors. Leaving the policy claiming controls
that weren't implemented is an overclaim — the exact failure mode the security-legal mandate
guards against. Direction: implement to match the policy **as written**.

## Decisions & changes

### 1. Revocation offboarding + Chase webhook
- `plaid.ts` `offboardPlaidItem(orgId)` — revokes the item at Plaid and tears down the local
  connection (status DISCONNECTED, tokens/cursor cleared).
- Webhook: `USER_PERMISSION_REVOKED` **and** `USER_ACCOUNT_REVOKED` (Chase-only) → offboard
  (not a re-link prompt). ERROR / PENDING_* still prompt re-link. Stored transactions follow
  the 25-month retention window (policy as written), not immediate deletion.

### 2. Account deletion — flag now, purge within 30 days (SEC-POL-003 §5.2)
- Schema: `User.deletedAt DateTime?`.
- `DELETE /api/account/delete` — within-24h obligations done synchronously: revoke all OAuth
  tokens at every provider, flag `deletedAt` (disables access immediately), blank stored
  tokens, clear the session.
- `auth.ts` `getSessionUser` and the login route reject any user with `deletedAt` set — access
  disabled immediately during the grace window.
- Settings → Danger Zone "Delete account" UI (confirm → call → redirect to /login).

### 3. Nightly retention purge (SEC-POL-003 §4)
- `GET /api/cron/purge` (Bearer `CRON_SECRET`, same as /cron/sync):
  (a) hard-delete users with `deletedAt` older than 30 days → cascades orgs/integrations/
  transactions/MRR snapshots (completes the §5.2 "delete within 30 days" obligation);
  (b) delete transactions older than **25 months** (collection date);
  (c) delete MRR snapshots older than 25 months.
  Each run logs a structured audit summary (timestamp, per-category counts, errors).
- `vercel.json`: added `/api/cron/purge` at `0 4 * * *`.

## Maps to Plaid "User offboarding" checklist
- Implement /item/remove flows — already built (disconnect).
- Listen for revocation webhooks — done (USER_PERMISSION_REVOKED + USER_ACCOUNT_REVOKED).
- Follow data retention policies — done (account-deletion path + nightly purge now exist).

## Verification & required step
- `npx eslint` — 0 errors (1 prior console warning fixed → `console.warn`).
- `npx tsc --noEmit` — clean EXCEPT errors on the two new Prisma fields (`User.deletedAt`,
  `Integration.newAccountsAvailable`); the client isn't regenerable in the build sandbox
  (engine download blocked). **Action: run `npx prisma db push`** to apply both columns and
  regenerate the client; tsc then passes.
- Ensure `CRON_SECRET` is set so `/api/cron/purge` is authorized (Vercel Cron sends it).
