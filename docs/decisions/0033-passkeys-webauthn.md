# 0033 — Passkeys (WebAuthn) as a second factor

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist + data-db + ui-frontend

## Context
2FA review: the app had TOTP (working, enforced) and a backup-codes UI that is **non-functional**
(codes shown but never stored). User chose to add **passkeys/WebAuthn** as the marquee 2FA
upgrade — phishing-resistant, no shared secret, Face ID / Touch ID / security keys.

## Decision
Passkeys are a registrable authenticator that **satisfies the account's 2FA requirement** on
its own (a user with ≥1 passkey is treated as having 2FA, same as TOTP). Built on
`@simplewebauthn/server@^13` (server) + `@simplewebauthn/browser@^13` (client).

## Changes
- **Schema:** `Credential` model (id, userId, publicKey `Bytes`, counter, deviceType, backedUp,
  transports CSV, webauthnUserID, name, timestamps) + `User.credentials`.
- **`src/lib/webauthn.ts`:** RP config from `NEXT_PUBLIC_BASE_URL` (rpID = hostname); signed
  short-lived challenge cookies (reg carries the WebAuthn user handle); thin wrappers around
  generate/verify registration + authentication.
- **Routes:** `webauthn/register/{options,verify}` (session-gated), `webauthn/authenticate/
  {options,verify}` (identity from the pre-auth cookie; verify mints the session), and
  `webauthn/credentials` (GET list / DELETE).
- **Gate generalized:** `userHasSecondFactor(userId)` = `mfaEnabled` OR ≥1 passkey. Used by the
  login route (challenge when either is present) and the Plaid Link gate.
- **UI:** Settings → Passkeys card (add via `startRegistration`, list, remove); `/login/mfa`
  → "Use a passkey" button (`startAuthentication`) alongside the TOTP code.

## Verification
- `eslint` — 0.
- `tsc` — remaining errors are ONLY: `@simplewebauthn` module resolution (until `npm install`)
  and the `Credential` model + `deletedAt`/`newAccountsAvailable` (until `prisma db push`). No
  independent logic errors.
- WebAuthn cannot be exercised in the build sandbox (no browser/authenticator) — needs live
  testing (below).

## Required before this works
1. `npm install` (adds `@simplewebauthn/server` + `@simplewebauthn/browser`).
2. `npx prisma db push` (creates `Credential`, regenerates client).
3. `NEXT_PUBLIC_BASE_URL` set correctly — rpID is derived from it and **passkeys are bound to
   that domain** (localhost in dev; the real domain in prod — passkeys registered on one rpID do
   not work on another).

## Live-test checklist
- Settings → Add a passkey (Touch ID / security key) → appears in the list.
- Log out → log in with password → "Use a passkey" → lands on dashboard.
- A passkey-only account (no TOTP) can connect a bank (Plaid gate accepts passkey).
- Remove a passkey; if it was the only second factor, confirm the desired behavior.

## Still open (separate)
- **Backup codes remain non-functional** (generated, shown, never stored, insecure RNG). With
  passkeys + TOTP available, recommend either implementing real hashed recovery codes or
  removing the backup-codes UI so it stops promising a recovery path that doesn't exist.
