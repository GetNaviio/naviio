# 0008 — Stripe client connections via OAuth (amends 0007); full test deferred

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** Eric + stripe-specialist

## Context
0007 chose restricted read-only keys. Reconsidered for the smoother "Connect /
sign in with Stripe" client experience, so we switched the integrations Stripe
button back to **Connect OAuth**. Restricted-key paste flow was removed from the
UI but the backend `POST /api/auth/stripe` still accepts `rk_…`/`sk_…` if needed.

## Decision
- Stripe **"Connect" → OAuth** (`getConnectAuthUrl`, scope `read_write` — Stripe
  gates `read_only` behind a support request; Naviio only ever reads).
- `STRIPE_CLIENT_ID` set; OAuth enabled + redirect URI registered in Stripe.
- Hardened the callback: clear errors on missing/garbled `state`; `exchangeCode`
  now surfaces Stripe's response body on failure.

## Status / open
- OAuth reaches Stripe's authorize screen successfully. Full end-to-end exchange
  is **NOT yet verified** because the only available account is the platform
  account itself, and Stripe won't let a platform connect to itself (caused a
  `400`). Verifying requires a **second Stripe test account** acting as a client —
  deferred to the testing stage.
- For production this is a non-issue: real clients select their own existing
  account and authorize.

## Follow-ups (testing stage)
- Create a throwaway second Stripe test account → run Connect end to end →
  confirm callback stores the connected `Integration` and metrics read through it.
- If the platform model proves undesirable, the restricted-key flow is still in
  the backend and can be re-surfaced.
