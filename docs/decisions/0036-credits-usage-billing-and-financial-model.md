# 0036 — Usage-based credits, metered features, and the financial-model engine

- **Date:** 2026-06-10
- **Status:** accepted (credits shipped end-to-end; financial-model UI pending)
- **Owner (DRI):** product + security-legal-specialist

## Summary
Turned Naviio from a read-only dashboard into a product with a usage-based business
model. Added a credit ledger, metered the two features that cost us real money
(Navi/Claude messages and on-demand Plaid refresh), and built a real Stripe
Checkout reload flow — all priced against the **actual** vendor rates. Also laid
the foundation (schema + tested pure logic) for the COGS / gross-margin financial
model. Several reliability fixes landed along the way (auth cookie, Navi model +
formatting, dashboard hydration).

## Pricing facts used (grounded, not assumed)
- **Plaid** (client's own rate card, "Contracts & Rates" created 2026-06-03):
  Transactions **$0.30/connected account/mo**, Recurring Transactions $0.15/acct/mo,
  **Transactions Refresh $0.12/successful call**, Auth $1.50/initial call,
  **Balance $0.10/call**. The Master Services Agreement the client uploaded contains
  **no pricing** — rates live only in the Order/rate card (MSA §1.1, §2).
- **Stripe** payment processing: **2.9% + $0.30** per US online card charge. Reading a
  connected account's data via OAuth costs **nothing** — so Stripe is not a per-customer
  data cost the way Plaid is.
- **Claude** (Anthropic API, May 2026): Opus 4.8 $5/$25, **Sonnet 4.6 $3/$15**,
  Haiku 4.5 $1/$5 per Mtok (in/out). A typical Navi message ≈ $0.015 on Sonnet.

## Decisions
- **Meter only cost-backed features.** `navi_message` (1 credit) and
  `realtime_refresh` (3 credits). **Dropped `stripe_sync`** — Stripe reads are free,
  so charging for them would be value-based, not cost recovery.
- **3 credits per real-time refresh.** Break-even is ≤2 credits even at the deepest
  pack discount, so 3 keeps a positive margin at every tier (33–60%); refunded if the
  Plaid call fails.
- **Single $10 reload = 100 credits.** Dropped the multi-tier packs for simplicity
  ($0.10/credit; nets ~$9.41 after Stripe). 100 credits = 100 Navi messages or 33 refreshes.
- **Navi runs on Sonnet 4.6** (was Opus) — ~½ the cost, strong enough for financial Q&A,
  comfortable margin at 1 credit/message. One-line change to revert to Opus.

## Changes — credits & billing
- **Schema** (`prisma/schema.prisma`): `CreditAccount` (running balance), `CreditLedgerEntry`
  (append-only; +purchase/grant/refund, −charge; `stripeRef` for idempotency),
  `TxnClassification` + `ExpenseClass` enum (for the financial model). Requires `prisma db push`.
- **`lib/credits/rates.ts`** — `FEATURE_COST`, `costOf`, `hasEnough`, the single `reload` pack.
- **`lib/credits/account.ts`** — `getBalance`, `addCredits`, **`chargeCredits`** (atomic, throws
  `InsufficientCreditsError`, never goes negative), **`recordPurchase`** (idempotent on `stripeRef`).
- **Real-time refresh** — `plaid.refreshTransactions()` (paid `/transactions/refresh` + sync);
  `POST /api/plaid/refresh` reserves credits → refresh → **refunds on failure**; 402 when empty.
- **Navi metering** — `/api/insights/chat` charges 1 credit after the snapshot builds, 402 when
  out, refunds the credit if the model stream errors.
- **Buy credits** — `POST /api/credits/checkout` (Stripe Checkout on the platform account),
  `POST /api/credits/webhook` (`checkout.session.completed` → idempotent grant), and a
  **webhook-independent** `POST /api/credits/confirm` that verifies the returned session
  (`?session_id=`) so the balance updates even if the local webhook isn't forwarding.
- **UI** — `components/RefreshNowButton.tsx`: real-time refresh button, live balance, "Reload $10",
  auto-confirm + balance polling on return, auto-dismissing status messages. Placed on the dashboard
  when Plaid is connected. (Dev-only test-credit grant was added then removed after testing.)
- **Config** — `.env.example` documents `STRIPE_CREDITS_WEBHOOK_SECRET` (falls back to
  `STRIPE_WEBHOOK_SECRET`).

## Changes — financial model (foundation)
- **`lib/model/cogs.ts`** — splits EXPENSE into COGS vs OpEx (Plaid PFC + keyword heuristics;
  user overrides win). **`lib/model/incomeStatement.ts`** — Revenue → COGS → Gross Profit →
  Gross Margin → OpEx → Operating Income. Pure, unit-tested (`tests/lib/model-cogs.test.ts`).
- Tags persist via `TxnClassification` (keyed by `externalId`, survives re-syncs).
- **Pending:** thread gross margin into the forecast scenarios, build the `/api/model` route +
  Financial Model page, and the COGS tagging UI (tasks 121–123).

## Reliability fixes (same session)
- **Auth cookie** — `makeSessionCookieHeader` / pre-auth header now add `Secure` **only in
  production**. Over `http://localhost` browsers were dropping the `Secure` session cookie, which
  silently broke login (root cause of repeated "Unauthorized"). 
- **Navi** — rebranded to "Navi", rewritten to output clean plain text (no markdown/emoji) via
  `lib/naviFormat.cleanNaviText`; chat model fixed to a valid string; richer error surfacing.
- **Voice** — push-to-talk **voice input kept**; voice **output (TTS) removed** (OpenAI quota /
  Mac-voice issues parked).
- **Dashboard** — fixed a hydration mismatch by computing the "Last updated" timestamp after mount.

## Strategy artifacts
- `finance/Plaid-Cost-Forecast.xlsx` — editable model: Plaid cost at 1/10/20/50/100 customers
  (~$3.45/customer/mo on real rates, Balance-dominated) + a Real-Time Refresh credit-economics
  sheet (3 credits/refresh margins by tier).

## Verification
- `eslint` clean and `tsc --noEmit` exit 0 across all changes.
- Pure logic (COGS, income statement, credit rates) verified at runtime (jest can't run in the
  build sandbox; Node type-strip loader used instead).
- **End-to-end tested live:** dev-grant → refresh charged 3 credits (402 when empty, refund on
  failure); Stripe Checkout $10 → 100 credits credited on return.

## Required / follow-up
- One-time: `npx prisma db push` (creates the three new tables) — done during the session.
- Next: financial-model page + forecast margin (121–122), COGS tagging UI (123), credits
  usage-history view + header balance widget (127), and consolidated tests/decision gate (128).
