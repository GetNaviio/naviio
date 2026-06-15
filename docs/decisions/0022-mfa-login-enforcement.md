# 0022 — Enforce MFA at login; remove demo backdoor (Plaid ATT-1)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** CEO + security-specialist

## Context
Documenting the six Plaid Required Attestations (`docs/security/plaid-attestations.md`,
SEC-ATT-001) surfaced that ATT-1 ("robust MFA on the consumer-facing app where
Plaid Link is deployed") was not actually satisfied. The TOTP machinery existed
(`/api/auth/mfa/*`, `mfaEnabled`/`mfaSecret` on `User`) but **was never enforced**:
`/api/auth/login` minted a full session immediately after the password check and
ignored `mfaEnabled`. A separate issue: a hardcoded demo credential
(`demo@markupai.com` / `password123`), prefilled on the login form, granted a full
no-MFA session — a shared static bypass incompatible with the attestation and with
the Plaid bank-migration diligence baseline (Access Management = "username:password:2FA").

## Decision
MFA is enforced **at authentication**. When an account has two-factor enabled, a
valid password yields only a short-lived **pre-auth** token and the user is sent to
a second-factor challenge; the session is minted only after the TOTP code verifies.
The Plaid Link connect path additionally refuses to issue a link token without MFA
(defense in depth). The demo backdoor is disabled in production.

## Changes
- **`src/lib/auth.ts`** — added `signPreAuthToken`/`verifyPreAuthToken`
  (5-min, `mfaPending:true` claim) and pre-auth cookie helpers
  (`markup_mfa_pending`). Hardened `verifyToken` to **reject any `mfaPending`
  token**, so a pre-auth token can never be replayed as a full session.
- **`src/app/api/auth/login/route.ts`** — when `mfaEnabled`, issue the pre-auth
  cookie and redirect to `/login/mfa` (JSON clients get `{ mfaRequired: true }`)
  instead of a session. Demo login gated behind `NODE_ENV !== 'production'`.
- **`src/app/api/auth/mfa/verify/route.ts`** — identity now comes from the pre-auth
  **cookie**, not a client-supplied `userId` (closes a session-minting hole).
  Verifies TOTP, mints the session, clears the pre-auth cookie; supports form + JSON.
- **`src/app/(auth)/login/mfa/page.tsx`** — new 6-digit challenge screen.
- **`src/app/(auth)/login/page.tsx`** — removed prefilled demo credentials + hint.
- **`src/app/api/auth/plaid/create-link-token/route.ts`** — connect-time MFA gate
  (HTTP 403 `MFA_REQUIRED`); **`PlaidLink.tsx`** surfaces it with a link to Settings.

## Verification
- `npx eslint` and `npx tsc --noEmit` — both exit 0.
- Standalone token test (6/6): real session accepted by `verifyToken`; **pre-auth
  token rejected** as a session; pre-auth accepted by `verifyPreAuthToken`; full
  session rejected by `verifyPreAuthToken`; garbage and wrong-secret tokens rejected.

## Follow-ups (not blocking)
- Optional: force MFA enrollment for **every** account at sign-up (current posture
  enforces MFA once enabled and hard-gates bank connection).
- Set a strong `JWT_SECRET` in production (code still defaults to a dev secret) and
  flip the session cookie to `Secure` only — both already flagged for rotation.
- Complete the Plaid bank-migration diligence questionnaire against the 11 control
  domains (see `docs/security/plaid-diligence-coverage.md`).
