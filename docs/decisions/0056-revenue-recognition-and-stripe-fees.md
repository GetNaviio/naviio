# 0056 — Revenue recognition (charge date) + Stripe fees as an expense

## Context
The Overview "Revenue this month" card and the P&L "Total Income" disagreed
(e.g. $0 vs $31K for the same month). Root cause: the Overview card was wired to
`cashFlow.cashIn` (cash that landed in the **bank**), while the P&L used the
income statement (recognized revenue). When Stripe and the bank aren't reconciled
(or a payout hasn't settled), those two numbers diverge — and the card labeled
"Revenue" was actually showing **cash collected**, net of Stripe fees.

A senior-accountant review (subagent) was decisive.

## Decision (per the accounting review)

1. **Revenue is recognized at the Stripe charge, not the bank payout.**
   A successful charge is constructive receipt of cash you control (the Stripe
   balance is a cash account); the ~2-day payout is a transfer between two cash
   accounts you own, not a revenue event. So:
   - The Overview **"Revenue"** card now reads the **income-statement monthly
     revenue** (gross, charge-date) — the *same source* as the P&L "Total
     Income". The two now tie out to the penny.
   - Two surfaces showing different "Revenue" for one month is a trust-killer;
     they must agree.

2. **Revenue stays GROSS; Stripe processing fees are their own expense line.**
   Netting fees into the topline hides them and makes Naviio disagree with
   Stripe's own dashboard and the user's MRR. Instead:
   - `mapStripeFee` records each charge's `balance_transaction.fee` as a DEBIT
     in category **"Payment Processing Fees"** (externalId `<charge>_fee`).
   - `syncStripeData` expands `data.balance_transaction` and upserts the fee row.
   - `classify`: a **Stripe-source DEBIT is always a processing fee** → EXPENSE
     "Payment Processing Fees" (deterministic; runs before the merchant lookup
     that would otherwise label "stripe" as Software).
   - Bridge: **Revenue (gross) − Payment Processing Fees − refunds ≈ cash that
     eventually arrives.**

3. **Cash-timing is preserved but relabeled.** `cashFlow.cashIn` is now the
   **"Cash collected"** card on the Cash Flow page (was "Cash In"), with a
   tooltip stating it is NOT Revenue. This is the working-capital view (are
   payouts delayed? did an ACH bounce?).

4. **Net Burn / Runway stay on the cash side** — they're genuinely
   cash-availability questions.

## Why this is robust
- Revenue and the P&L share one engine → they cannot drift.
- Fee classification is structural (`source==='stripe' && type==='DEBIT'`), not
  regex on a description, so it can't be mis-bucketed.
- Refund handling unchanged: charge amount is already net of refunds; the gross
  fee is a small known approximation on refunded charges (Stripe refunds part of
  the fee) — acceptable, and revisitable if needed.

## Tests
`tests/lib/stripe-map.test.ts` covers `mapStripeFee` (fee → DEBIT expense, null
when unexpanded/zero) and `classify` (Stripe DEBIT → Payment Processing Fees;
Stripe CREDIT → gross Revenue).
