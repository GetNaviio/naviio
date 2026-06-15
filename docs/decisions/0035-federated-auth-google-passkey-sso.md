# 0035 — Sign in / sign up with Google, passkey, and SSO

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist + auth

## Decision
Add three federated/passwordless sign-in methods to **both** the login and register pages,
alongside the existing email+password: **Continue with Google**, **passkey** (passwordless),
and **enterprise SSO via WorkOS**. All converge on the same session (`signToken` +
`markup_session` cookie). Federated identity is treated as strong auth, so a successful
Google/SSO/passkey sign-in mints a session directly; the app's TOTP/passkey second factor
still gates Plaid bank connection.

## Changes
- **`lib/auth.ts`** — `upsertFederatedUser()` finds-or-creates a user by email, links the
  provider in the `Account` table, and rejects accounts flagged for deletion.
- **Google** — `GET /api/auth/google` (state-cookie CSRF → consent) + `/callback`
  (code exchange, **verified-email** userinfo, upsert, session). Raw fetch, no dependency.
- **Passkey (passwordless)** — `webauthn/login/{options,verify}` use **discoverable**
  credentials (no email; the credential identifies the user) and `webauthn/signup/{options,
  verify}` create a passwordless account from an email + new passkey. Built on the existing
  `@simplewebauthn`.
- **WorkOS SSO** — `GET /api/auth/sso?email=` resolves the org by email domain
  (`organizations.listOrganizations({ domains })`) → `sso.getAuthorizationUrl`; `/callback`
  exchanges via `sso.getProfileAndToken`, upserts, mints the session.
- **UI** — `components/auth/SocialAuth.tsx` (Google / passkey / SSO buttons with inline email
  prompts) added to `/login` (`mode="login"`) and `/register` (`mode="register"`).
- **Config** — `@workos-inc/node` added to `package.json`; `.env.example` documents
  `GOOGLE_*` and `WORKOS_*`.

## Verification
- `eslint` — 0.
- `tsc` — clean except expected errors pending `npm install` (`@workos-inc/node`,
  `@simplewebauthn`) and `npx prisma db push` (`credential` model). No logic errors.
- Federated flows can't be exercised in the build sandbox (need live IdPs + a browser).

## Setup required before these work
1. `npm install` (adds `@workos-inc/node`); `npx prisma db push` (Credential table, if not yet).
2. **Google:** Cloud Console → OAuth client (Web) → authorized redirect
   `https://<domain>/api/auth/google/callback`; set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`
   (use the localhost callback in dev).
3. **WorkOS:** dashboard API key + redirect `https://<domain>/api/auth/sso/callback`; configure
   each customer **organization + SSO connection** and verify their email **domain** (the
   domain→org lookup drives routing). Set `WORKOS_API_KEY/CLIENT_ID/REDIRECT_URI`.
4. Passkeys: domain-bound (see decision 0033) — dev derives RP ID from the request.

## Notes / follow-ups
- Federated sign-in mints a session without forcing the app's TOTP step; if you later want
  TOTP enforced even on Google/SSO login for users who enabled it, add a post-federation MFA
  check.
- WorkOS SDK usage written to the documented v7 API but not runtime-verified here — confirm
  `getAuthorizationUrl` / `getProfileAndToken` shapes on first live test.
