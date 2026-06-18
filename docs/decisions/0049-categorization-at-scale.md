# 0049 — Transaction categorization at scale (data-driven + self-improving)

- **Date:** 2026-06-17
- **Status:** accepted
- **Owner (DRI):** product + AI
- **Builds on:** classifier accuracy core (`lib/metrics/classify.ts`), vendor-level
  overrides (#142), the payroll-vs-transfer fix.

## Problem
The classifier was a hand-maintained list of keyword/PFC rules in code. Every
mislabel (e.g. Plaid filing a Gusto payroll ACH as `TRANSFER_OUT`) required an
engineer to edit a regex and ship. That does not scale across many users, banks,
and descriptor formats, and it cannot learn from the corrections users already
make. Same root cause as the Gusto bug: a per-row decision off a brittle tag,
with no merchant identity, no confidence, and no feedback loop.

## Decision
Move categorization from **code** into **data**, and let user corrections train
it. Category is a *label*, not a financial figure — so heuristics/ML are allowed
here, while the dollar math stays 100% deterministic ("compute, don't
hallucinate"). Phases 1–6 below ship now (no external ML); phase 7 (the model)
is deferred to the Together AI plan in `0050`.

## What shipped (phases 1–6)
1. **Merchant registry + decoupled decisions (items 1, 2).** One data-driven
   `MERCHANT_RULES` table replaces scattered keyword lists and the special-case
   payroll guard. Each rule carries `category`, `beatsTransfer` (a DEBIT here is a
   real P&L expense even when Plaid says transfer — generalizes the payroll fix to
   any expense-vendor), and `brand` (recognizable brand → higher confidence). New
   merchants are added as data, not code branches.
2. **Layered resolver with explicit precedence (item 3).** `classify` →
   `resolveVendorCategories` → `resolveTxnCategoryDetailed` apply, in order:
   per-transaction override → per-org vendor override → per-org majority vote →
   community prior → known merchant → Plaid PFC → 'Other'. Each layer is a lookup.
3. **Confidence + provenance (item 6).** Every classification returns a
   `confidence` (0..1) and a `source` ('user' | 'community' | 'merchant' | 'plaid'
   | 'recurrence' | 'rule' | 'fallback'). An expense that lands at 'Other' is
   flagged `needsReview`.
4. **Cross-org community map (item 4).** New `VendorCategoryStat` table:
   anonymized `(vendorKey → category, count)` votes, fed automatically whenever a
   user sets a **vendor-level** override. Read back as a confidence-weighted prior
   that fills vendors a given org hasn't fixed and the heuristics couldn't name.
   **Privacy:** stores ONLY a normalized merchant string + the agreed label +
   a count — no amounts, no org/user identity, no transaction detail — so it is
   safe to pool across customers. It never overrides a user's own choice
   (`MIN_VOTES` guards against single-click propagation). This is the compounding,
   proprietary dataset behind the categorization moat: one user fixing "Gusto"
   teaches every org, permanently, with zero code change.
5. **Recurrence + counterparty detection (item 5).** `detectRecurring` finds
   streams with the same counterparty, a regular cadence (weekly/biweekly/monthly/
   quarterly), and a stable amount. Vendor-agnostic — catches payroll/rent/SaaS
   for merchants we've never seen — and is used to prioritize the review queue.
6. **Review queue (item 6, surfaced).** `/api/transactions` returns `confidence`,
   `categorySource`, `needsReview`, and `recurring` per row. The Expenses tab adds
   a "Needs review · N" filter and a per-row "Review" chip (recurring + larger
   items first), turning silent guesses into one-tap confirmations — which then
   feed the community map (the loop closes).

## Why this is the right shape
- **No deploy to fix a vendor.** Overrides + the community map update behavior
  from data. The merchant registry is the cold-start prior, not the system.
- **Self-improving.** Corrections users already make become permanent, shared
  training signal. Accuracy compounds with usage.
- **Honest.** Low-confidence rows are surfaced, not hidden. Dollar math unchanged.
- **Consistent.** The metric engine (`incomeStatement`) and the transactions
  table consume the same resolver + community prior, so labels reconcile.

## Guardrails
- Community reads/writes are raw SQL and never throw into the request path
  (degrade to an empty prior if the table isn't migrated).
- `beatsTransfer` is DEBIT-scoped so payroll refunds (credits) aren't miscaught.
- Unit tests: confidence/needsReview, community prior precedence (incl. "user fix
  always wins"), and recurrence cadence/stability/credit-exclusion.

## Migrations / ops
- `20260617020000_vendor_category_stat` — `VendorCategoryStat` table. Run
  `prisma migrate deploy`.

## Deferred
- Phase 7 — the ML classifier trained on accumulated corrections, served via
  Together AI, gated by an eval harness. See `0050-ml-categorization-together-ai.md`.
