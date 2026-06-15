# 0014 — Plaid + Stripe as source of truth; one metric engine over the ledger

- **Date:** 2026-06-10
- **Status:** accepted (engine built; page wiring in progress)
- **Owner (DRI):** naviio-orchestrator (metrics)

## Context
Goal: a deployed product with **zero demo financials** and every metric card
populated with accurate live data. Audit showed only 2 surfaces were live and the
prior P&L "synthesis" naively summed all credits/debits (double-counting Stripe
revenue, treating transfers/loan principal as expense).

## Decision — source-of-truth hierarchy (supersedes 0011/0013 ordering)
1. **Primary: Plaid + Stripe** — raw bank movements + raw payment events. These are
   actual money, not bookkeeping, so they're ground truth.
2. **Fallback: QuickBooks/Xero — transactions only** (bank feed / journal lines /
   invoices), never their computed P&L or balance-sheet reports, which can be
   unreconciled, duplicated, or miscategorized. Their raw lines flow into the same
   ledger and we compute everything ourselves. *(Their txn sync is not yet built;
   the interim fallback still parses their report.)*
3. **We own the math.** One engine computes every metric from one normalized,
   deduplicated ledger, so a number means the same thing everywhere.

## The engine (`src/lib/metrics/`)
- **`classify.ts`** — pure classifier. Every row → REVENUE | EXPENSE | TRANSFER.
  Dedup/exclusion rules:
  - **Stripe payout landing in the bank** → TRANSFER(STRIPE_PAYOUT), excluded from
    P&L (already counted as the Stripe charge) but counted as cash-in for cash flow.
  - **Internal transfers** (Plaid `TRANSFER_IN/OUT`) → excluded from P&L and cash flow.
  - **Loan principal / capital** (`LOAN_PAYMENTS`) → excluded from P&L expense, but
    counted as cash-out.
  - Other credits → revenue; other debits → categorized operating expense.
- **`compute.ts`** — pure aggregations: `incomeStatement` (income/expenses/net/
  net-margin/by-category/by-month), `cashFlow` (cash-basis, Plaid only; burn from
  net-negative months), `runwayMonths`.
- **`ledger.ts`** — DB loader + UTC `startOfYearUTC` (fixes timezone YTD drift).
- Unit-tested in `tests/lib/metrics.test.ts` (12 assertions incl. the
  double-count/transfer cases) — verified green.

## Wired so far
- **`/api/pl`** re-pointed: ledger engine first (Plaid/Stripe, deduped), accounting
  report only as fallback, and **`source: 'none'` instead of demo** when nothing is
  connected. The P&L band caption updated (no longer claims bank data is approximate).

## Consequences / next
- Revenue no longer double-counts the Stripe→bank payout; expenses exclude
  transfers and loan principal.
- Still to wire onto the engine: Overview, Cash Flow (burn/runway), Expenses
  (categories + real txn table), KPIs, and connect-prompt empty states everywhere
  (decision: no demo data in prod).
- Follow-ups: sync QBO/Xero **transactions** into the ledger; Stripe refund netting;
  Plaid cash balance = depository-only; bust `org:<id>:pl` on connect/sync.
