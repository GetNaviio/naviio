# 0031 — Production hardening for go-live

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist

## Context
Plaid Production approved; user authorized go-live. A pre-flight scan found production-only
risks in fail-open fallbacks.

## Changes (`src/lib/auth.ts`, `src/lib/crypto.ts`)
- **`JWT_SECRET` fails closed in production.** Replaced the constant
  `process.env.JWT_SECRET || 'dev-secret-change-in-production'` with `getJwtSecret()`, which
  throws in production when unset (resolved per-call so the build never throws) and keeps the
  dev fallback locally. Prevents session forgery via a publicly-known default.
- **Session cookie `Secure` in production.** `setSessionCookie` (used by the register route)
  was `secure: false`; now `secure: NODE_ENV === 'production'`.
- **Token encryption fails closed in production.** `encryptSecret` throws in production if
  `TOKEN_ENCRYPTION_KEY` is unset, instead of silently storing the token as plaintext.

## Verification
- `npx eslint` (changed files) — 0.
- `npx tsc --noEmit` — no new errors (only the pending-`db push` field errors remain).

## Pre-flight summary (also confirmed)
- `.env` gitignored and untracked; no committed secrets.
- Only remaining tsc errors are the two new schema fields, cleared by `npx prisma db push`.

## Go-live
Runbook: `docs/deploy/go-live-runbook.md` (OPS-RUN-001). The cutover steps (secrets, env vars,
`prisma db push`, deploy) are executed by the user — they require production credentials and
deploy access, which the assistant does not handle.
