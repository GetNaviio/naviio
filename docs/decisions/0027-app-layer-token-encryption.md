# 0027 — Application-layer encryption of stored OAuth tokens

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist + data-db

## Context
Pre-production review (Plaid "Port to production": *Store Production access tokens* / *Store
sensitive user data appropriately*) found that `SEC-POL-001` §3.1 claimed *"OAuth access
tokens and API keys stored in the database are additionally encrypted at the application
layer before persistence"* — but no such encryption existed. Tokens were stored relying only
on RDS at-rest (AES-256) encryption. Acceptable to Plaid ("stored securely"), but the policy
overclaimed, and app-layer encryption is materially better for a financial app: a DB dump or
read-replica leak would not expose usable provider tokens. Direction: implement it so the
policy is true.

## Decision
Encrypt `Integration.accessToken` and `refreshToken` with **AES-256-GCM** at the application
layer, transparently, for all eight integrations.

## Changes
- **`src/lib/crypto.ts`** — `encryptSecret` / `decryptSecret`. Envelope format
  `encv1:<iv>.<tag>.<ciphertext>` (base64). Versioned prefix enables rotation and lets
  decrypt pass **legacy plaintext through** (no prefix) so existing rows keep working and are
  re-encrypted on next write. Key from `TOKEN_ENCRYPTION_KEY` (32 bytes, hex or base64).
  Encrypted value with a missing/invalid key throws — fail loud, never use a broken token.
- **`src/lib/prisma.ts`** — Prisma client `$extends` query hook on the `integration` model:
  encrypts secret fields on create/update/upsert/createMany/updateMany, decrypts on every
  read. Centralized → covers Plaid, Stripe, QuickBooks, Xero, Gusto, ADP, Shopify, and
  GoHighLevel without per-integration edits. (All token reads in the codebase go through
  `prisma.integration.find*` directly — none via relation include — so the hook covers them.)
- **`.env.example`** — documents `TOKEN_ENCRYPTION_KEY` (required in prod; must stay stable).
- **`SEC-POL-001` §3.1** — annotated with the implementation reference (policy now true).

## Verification
- Standalone crypto round-trip: encrypt → prefixed ciphertext ≠ plaintext; decrypt restores
  original; legacy plaintext passes through. All pass.
- `npx eslint src/lib/crypto.ts src/lib/prisma.ts` — 0.
- `npx tsc --noEmit` — no errors in crypto.ts / prisma.ts; only the pre-existing
  `deletedAt` / `newAccountsAvailable` errors remain (pending `npx prisma db push`).

## Operational notes
- **Set `TOKEN_ENCRYPTION_KEY` in production** (`openssl rand -base64 32`). Without it, tokens
  are stored unencrypted (dev fallback) — must not happen in prod.
- The key must remain **stable**. Rotating it makes existing encrypted tokens unreadable
  (users would need to reconnect). A future key-rotation routine (decrypt-with-old →
  encrypt-with-new) can be added if rotation is required.
- Migration is seamless: existing plaintext tokens keep working and become encrypted the next
  time they're written (reconnect, refresh, or status update).
