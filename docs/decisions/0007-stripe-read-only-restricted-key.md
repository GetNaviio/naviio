# 0007 — Connect Stripe via read-only restricted keys, not Connect OAuth

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** Eric + stripe-specialist

## Context
Stripe Connect OAuth makes Naviio a payment *platform* (Connect Platform
Agreement, risk/loss liability, funds-flow setup). Naviio only needs to **read**
a business's financial data for visibility — it never processes payments or moves
money. Connect is the wrong tool and adds unwanted liability.

## Decision
Connect Stripe accounts using **restricted, read-only API keys** (`rk_…`) instead
of Connect OAuth:
- A business creates a restricted key in *their* Stripe with **Read** on Charges,
  Customers, Subscriptions, Invoices, Balance, Products, Prices (everything else
  None; all Connect permissions None) and hands it over.
- `POST /api/auth/stripe` now accepts `rk_…` (and `sk_…`) and stores it on the
  Integration row. The integrations page opens a paste-key input for Stripe
  instead of redirecting to OAuth.
- The Connect OAuth route remains but is no longer the primary path; the GET
  guards against a missing client_id.

## Consequences
- No Connect platform, no Connect Platform Agreement, no payments liability.
- Read-only by construction — the key cannot write.
- Same paste-key flow works for the multi-client / advisor model: each client
  supplies their own `rk_…`.
- `getStripeForUser` prefers the stored key over the env `STRIPE_SECRET_KEY`.

## Loop / verification
- `eslint` + `tsc` clean. Manual: pasted a restricted key → Stripe card shows
  "Connected", `/revenue` reads live metrics.
