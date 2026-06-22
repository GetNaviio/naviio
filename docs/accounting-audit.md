# Accounting-accuracy audit & remediation

Code-grounded accounting review of the financial engine (cash basis, for startups
+ fractional CFOs). Severity: **P0** = materially wrong numbers a CFO would catch;
**P1** = misleading / edge-case wrong; **P2** = polish / disclosure.

## Status

### Fixed
- **Revenue recognition** — Overview "Revenue" now = recognized revenue (income
  statement, gross, charge-date), ties to the P&L. (`9a8db97`, decision 0056)
- **Stripe fees as expense** — gross→net bridge; "Payment Processing Fees" line.
  (`cf64929`, decision 0056)
- **P0-1 / P0-2 Burn rate** — was averaging ONLY negative months (overstated burn,
  ~2× short runway). Now trailing-3 complete-month average net. (`c8534cd`)
- **P1-2 Owner equity** — owner draws / distributions / capital contributions now
  classified as CAPITAL transfers (excluded from P&L, kept in cash flow); were
  hitting revenue/expense. (`c8534cd`)

### Open — P0 (do first)
- **P0-4 Stripe payout dedup is regex-on-"stripe"** (`classify.ts:64,67`). Misses
  payouts many banks label differently → **double-counts the top line** (charge +
  bank deposit); also over-excludes unrelated "stripe" credits. **Fix:** reconcile
  bank CREDITs against `stripe.payouts.list` by amount + arrival_date (±days),
  one-to-one; keep regex only as a weak fallback. Needs a persisted payout set
  (DB) + live Plaid+Stripe data to validate. Highest material risk.
- **P0-3 Annual/upfront subs recognized 100% on charge date, contradicting MRR.**
  Cash-basis-defensible, but the same annual customer shows $12k income in month 1
  AND $1k/mo MRR with no reconciliation. **Fix:** either ratable recognition
  (deferred revenue) or clearly label/disclose "cash collections (gross billings)"
  and reconcile to MRR.

### Open — P1
- **P1-1 Loan interest dropped** — loan payments excluded whole (principal correct,
  interest is a real expense). Needs Plaid Liabilities to split. Disclosed today.
- **P1-3 Sales tax counted as revenue** — `mapStripeCharge` books `amount` incl.
  Stripe Tax; tax is a pass-through liability. Subtract tax; exclude remittances.
- **P1-4 Multi-currency summed blindly** — every sum ignores the `currency` field.
  Guard/flag mixed currency or convert via FX; don't blend.
- **P1-5 Fee currency** — fee uses settlement currency, charge uses presentment;
  bridge subtracts unlike units when they differ.
- **P1-6 Churn** — denominator omits the start-of-period base correction and the
  cancel filter uses `created` not `canceled_at` (systematically too low); logo vs
  revenue churn mixed into LTV.
- **P1-7 MRR ignores coupons/discounts/proration/tiered (null unit_amount)**.
- **P1-8 cashFlow is Plaid-only** — Stripe-only or accounting-only orgs show 0
  burn / Liquidity 95. Derive cash flow from the primary source or gate runway.
- **P1-9 Cohort/NRR match by subscription, not customer** — re-signed/multi-sub
  customers book false churn + new, contaminating NRR.

### Open — P2
- UTC vs local month boundaries; `getRevenueByMonth` partial earliest bucket +
  no refund/dispute filter; waterfall rounding identity; LTV not gross-margin
  weighted; CAC (customers) vs LTV (subscriptions) mismatch; Magic Number window.

## Validated as correct (do NOT "fix")
Refund contra-revenue (`stripe-map.ts:19`); gross→net fee bridge; QBO SalesReceipt-
only (no Deposit double-count); source-of-truth hierarchy (Plaid/Stripe > accounting);
cash = depository only; payroll `beatsTransfer`; Plaid sign convention; MRR interval
normalization + ARR=MRR×12; NRR/GRR formulas; division-by-zero discipline; pagination.
