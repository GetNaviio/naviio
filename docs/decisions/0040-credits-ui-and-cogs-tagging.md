# 0040 — Credits & Billing UI + COGS tagging UI

- **Date:** 2026-06-15
- **Status:** accepted
- **Owner (DRI):** product

## Decision
Surface the existing credit metering and COGS classifier to users with two
customer-facing UIs:

1. A **Credits & Billing** view showing the live balance, a one-click $10 /
   100-credit reload (Stripe Checkout), what each metered feature costs, and the
   full usage history (the append-only ledger). It lives under **Settings →
   Billing & Credits** (see "Settings reorg" below) — not a top-level nav item.
2. A **COGS / OpEx tagging control** in the Expenses transactions table, so an
   owner can correct the gross-margin split per transaction. It reuses the
   "fix-the-AI" write path (`PATCH /api/transactions/classify`, `expenseClass`),
   so one fix moves the P&L, Expenses, and Financial Model at once.

## Changes
- **`/api/credits/history`** (new, `withOrg`) — newest-first slice of
  `CreditLedgerEntry` (`?limit=`, default 50 / max 200) plus the live balance in
  one round-trip. Never returns the raw `stripeRef` — only an `isPurchase` flag.
- **`/billing` page** — balance hero (amber when ≤ 5 / 0), reload button, a
  feature-cost reference card driven by `FEATURE_COST`, and the usage-history
  table with friendly labels (`navi_message` → "Navi message", etc.). Confirms
  the Stripe session on return (`?credits=success`, webhook-independent),
  auto-dismisses the banner, and re-fetches on bfcache `pageshow` — the same
  pattern as the dashboard reload button.
- **`lib/credits/checkout.ts`** — `createCreditCheckout` now takes a `returnPath`
  so checkout returns to the page that started it. New exported
  **`safeReturnPath`** sanitizes it (in-app path only) to prevent an open
  redirect on the Stripe success/cancel URL. `/api/credits/checkout` threads the
  body's `returnPath` through.
- **`/api/transactions`** — now also loads `classificationOverrides` and resolves
  each expense row's `expenseClass` (user override > heuristic) via
  `classifyExpense`, returning `expenseClass` + `cogsOverridden`. Revenue/transfer
  rows return `expenseClass: null`.
- **Expenses table** — new "COGS / OpEx" column: a Badge (COGS = amber, OpEx =
  neutral) with an inline editor (COGS / OpEx / ↺ Reset to auto) and a Sparkles
  marker when user-tagged. Edits go through `PATCH .../classify` with
  `expenseClass` (null = reset), then bump the reload key so every view refreshes.
- **`types/index.ts`** — `Transaction` gains `expenseClass` + `cogsOverridden`.
- **Nav** — `Sidebar.tsx` gains a "Credits" item (Wallet icon).

## Why reuse the classify write path for COGS
The COGS override is already persisted by `txnClassification.expenseClass` and
read by `classificationOverrides`, which every consumer applies. Adding a UI on
top of the same PATCH means the gross-margin split a user fixes in Expenses is the
same one the Financial Model and P&L use — no second source of truth.

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint` on all changed files — clean.
- Pure-logic assertions (run via ts-node in the Linux sandbox, since the mounted
  `node_modules` ships macOS SWC binaries and `next/jest` can't load SWC here):
  `safeReturnPath` open-redirect guard (allows `/billing`, rejects
  `https://`, `//evil.com`, query strings, bare paths), credit rates/pack math,
  and `classifyExpense` override precedence — 13/13 passing.
- New jest spec `tests/lib/credits-checkout.test.ts` covers `safeReturnPath`;
  COGS precedence is already covered by `tests/lib/model-cogs.test.ts`. **Run the
  full `npm test` on the dev machine** (macOS) where SWC loads.

## Settings reorg
The Settings page was a single long scroll of cards. It's now **tabbed** with a
sub-navigation: **Organization** (team/entities), **Billing & Credits**
(`CreditsSection`), **Sharing** (client portal + white-label branding),
**Security** (2FA + passkeys), and **Account** (delete). The active tab is in the
URL `#hash` so it's linkable and survives reload; a returning Stripe Checkout
(`?credits=…`) auto-selects Billing. The credit UI lives in
`src/components/settings/CreditsSection.tsx` (extracted from the short-lived
`/billing` page, which was removed along with its sidebar link); its buy flow
returns to `/settings`.

## Notes / non-goals
- Single `$10` / 100-credit pack only (per prior decision 0036); no tiered packs.
- Buying credits and tagging COGS both require an authenticated org member; the
  reload button only appears when the balance is low/zero (dashboard + Navi).
