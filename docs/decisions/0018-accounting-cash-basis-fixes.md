# 0018 — Cash-basis accounting: disclosure + netting fixes

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** accounting-specialist + stripe-specialist + ui

## Context
The accounting/GAAP audit (`docs/diagnostics/2026-06-10-accounting-gaap-audit.md`)
confirmed the metric engine is a legitimate **cash-basis** P&L but found a false
basis label and several revenue-netting/classification errors. This resolves them.

## Decision — Naviio's financial statements are CASH BASIS (disclosed)
Revenue is recognized when cash is received, expense when paid. This is stated in
code and in the UI; we never present it as a GAAP accrual statement.

## Fixes applied
- **C-1 (cash-basis labeling).** Corrected the `compute.ts` `incomeStatement`
  docstring (was "accrual-style"). Added a **"Cash basis"** badge on the P&L page,
  "· cash basis" on the dashboard P&L snapshot, a full P&L footnote (excludes
  AR/AP, deferred revenue, prepaids, depreciation, loan interest), and a
  cash-basis note in the CPA disclaimer.
- **H-1 (refund netting).** `mapStripeCharge` now stores revenue **net of
  refunds** (`amount − amount_refunded`, floored at 0; ASC 606-10-32).
  `syncStripeData` re-syncs net on `charge.refunded` and now **paginates** charges
  (was capped at 100) so the ledger is complete.
- **H-2.** `getRevenueByMonth` nets partial refunds per charge (was gross).
- **H-3 (loan interest).** `LOAN_PAYMENTS` stays excluded (principal is financing,
  ASC 230); the dropped interest is now **disclosed** in the P&L footnote + a code
  comment. Robust split needs Plaid loan-detail enrichment.
- **M-1 (payout dedup).** Stripe-payout matcher tightened to `\bstripe\b` (was
  `/stripe|payout/`, which over-excluded unrelated "payout" credits). Noted that
  reconciling against Stripe `payouts.list` by amount/date is the robust fix.
- **D-2 (QBO double-count).** Dropped the QBO **Deposit** entity from the income
  sync (it re-banks SalesReceipt payments and can include capital). Income now from
  **SalesReceipt** only; expense from **Purchase**. Accrual Invoice/Bill stay out.

## Acceptable & disclosed (not "fixed" — inherent to cash basis)
- **C-2 / D-1.** Annual/up-front subscription cash lands in the collection month;
  no deferred revenue, AR/AP, prepaids, depreciation, or COGS. Correct for cash
  basis and now disclosed. True accrual requires the separate view below.

## Roadmap — a separate accrual/GAAP view (future)
Build as a distinct, clearly-labeled pipeline (never blended with the cash
ledger): a deferred-revenue recognition schedule (recognize subscription cash
ratably over the billing interval — solves C-2), AR/AP from invoices/bills,
prepaid amortization, and depreciation. Keep cash and accrual as two explicit
views.

## Verification
Pure-logic checks: refund-netting 3/3, payout-regex 4/4 (+ stripe-map and classify
suites). `eslint` exit 0, `tsc` clean except the expected `mrrSnapshot` errors
(clear after `prisma db push`).
