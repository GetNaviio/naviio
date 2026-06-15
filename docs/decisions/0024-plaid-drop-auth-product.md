# 0024 — Drop Plaid Auth product (data minimization)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** CEO + security-legal-specialist (decision); plaid-specialist (change)

## Context
While configuring Plaid Data Transparency Messaging (`SEC-CFG-001`), review found the Link
token requested `products: [Products.Transactions, Products.Auth]` while the codebase never
called `authGet`. Auth returns account/routing numbers for money movement; Naviio is a
read-only financial-intelligence dashboard and moves no money. Requesting unused data is
over-collection — it contradicts the consent pane and is a flag in bank/Plaid diligence.

## Decision
Request `[Products.Transactions]` only. Transactions returns balances and transactions across
depository **and** credit-card accounts, which powers every Naviio view (P&L, cash flow,
runway, KPIs, business credit-card expenses). Auth is not needed.

## Change
- `src/lib/integrations/plaid.ts` — `createLinkToken` products list reduced to
  `[Products.Transactions]`; comment records why and when to re-add.
- Plaid dashboard: consent pane no longer lists "Account and routing numbers."

## Verification
- `npx eslint src/lib/integrations/plaid.ts` — exit 0.
- `npx tsc --noEmit` — exit 0.
- No remaining `Products.Auth` / `authGet` references in `src/`.

## Reversal condition
Re-add `Products.Auth` only if a money-movement feature is built that actually calls
`authGet`, and add a matching Plaid use-case description before requesting it.
