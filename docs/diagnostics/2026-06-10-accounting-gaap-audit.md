# Accounting & US GAAP Audit — 2026-06-10 (accounting-specialist)

The metric engine is **cash basis** end to end (revenue at cash receipt, expense
at cash payment; no AR/AP, deferred revenue, prepaids, depreciation, or COGS).
That is a legitimate cash-basis P&L — the issues are mostly disclosure/labeling
plus a few real netting/classification errors.

## Errors to fix
- **C-1 (Critical) — cash basis labeled/implied as accrual.** `compute.ts:42`
  docstring literally says "accrual-style" (it's cash). P&L page, dashboard P&L
  snapshot, and CPA page show "Income statement / P&L" with no basis disclosed.
  ASC 606 / FASB CS-8 / OCBOA: cash-basis statements must be titled as such.
  Fix: correct the docstring + add a "Cash basis" badge/footnote.
- **C-2 (Critical) — annual/multi-month subscriptions booked entirely in the
  collection month; no deferred revenue.** A prepaid annual Stripe charge inflates
  one month's net income ~12× (ASC 606 wants ratable recognition / contract
  liability). MRR path is fine (it normalizes); the P&L is not. OK under a clearly
  labeled cash view; needs a recognition schedule for an accrual view.
- **H-1 (High) — Stripe ledger rows are GROSS; refunds never netted into the P&L.**
  `stripe-map.ts` stores `amount` and ignores `amount_refunded`. Revenue-page
  metric nets refunds but the P&L ledger does not, so the two revenue numbers
  disagree and the headline P&L overstates revenue. ASC 606-10-32. (Already a 0014
  follow-up.) Owner: stripe-specialist.
- **H-2 (High) — `getRevenueByMonth` counts partial refunds at gross** (only drops
  fully-refunded charges). Owner: stripe-specialist.
- **H-3 (High) — loan INTEREST dropped with principal.** `LOAN_PAYMENTS` is
  excluded whole; principal is correctly financing (ASC 230) but interest is a real
  (deductible) expense → understates expense, overstates net income and the tax
  estimate. Needs Plaid enrichment or disclosure.
- **M-1 (Medium) — Stripe-payout dedup is a loose regex** (`/stripe|payout/i`).
  Can over-exclude (a non-Stripe "payout" credit) or under-exclude (a payout the
  bank labels differently → double-counts revenue). The whole dedup premise rests
  on it. Fix: reconcile against Stripe `payouts.list` by amount/date.

## Acceptable simplifications — must be DISCLOSED
- **D-1** No AR/AP, deferred revenue, prepaids, accruals, depreciation, or COGS/
  gross-profit (hardcoded null). Fine for a cash product if labeled cash basis.
- **D-2** QBO/Xero fallback rows are cash-basis (Xero BankTransactions; QBO
  Purchase/Deposit/SalesReceipt — accrual Invoice/Bill correctly NOT pulled).
  Residual: a SalesReceipt + later Deposit of the same funds could double-count;
  QBO/Xero rows have no payout-dedup. Add a dedup test; document entity choice.
- **D-3** MRR/ARR/NRR/cohorts are non-GAAP operating metrics and are correctly
  labeled as such (no GAAP-conflation). Churned subs drop to 0 MRR. No action.

## CPA estimate
Math + disclaimer are sound, but it inherits every cash distortion above (C-2,
H-1/2, H-3). Add one line: "cash-basis YTD net income, annualized — lumpy if
billing is seasonal/annual."

## Prioritized path
1. Make cash basis explicit (C-1) — cheapest, removes the only GAAP-violation-
   presented-as-fact risk.
2. Net refunds into the ledger (H-1, H-2).
3. Tighten payout dedup + document/recover loan interest (M-1, H-3).
4. Only then a SEPARATE accrual/GAAP view: deferred-revenue recognition schedule
   (solves C-2), AR/AP from invoices/bills, prepaid amortization, depreciation.
   Keep cash and accrual as two explicitly-labeled views — never blended.
