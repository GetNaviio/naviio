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
- ✅ **P0-4 Stripe payout dedup** — now reconciles bank CREDITs against real
  `stripe.payouts.list` by amount + arrival date (±4d, one-to-one), persisted in a
  new `StripePayout` table; the description regex is demoted to a weak fallback
  used only when no payout data exists. Needs the migration applied + live data to
  validate. (matcher + tests; `StripePayout` migration `20260622010000`)
- ✅ **P0-3 Ratable revenue recognition (deferred revenue)** — multi-month
  subscription charges now recognize revenue straight-line across the Stripe
  invoice service period instead of 100% on the charge date; `deferredRevenue`
  surfaced on the income statement. Annual plans now agree with MRR. Monthly/
  one-time/expenses unchanged. (recognition window cols + transform + tests;
  migration `20260622020000`, decision 0057)

### Open — P1
- **P1-1 Loan interest dropped** — loan payments excluded whole (principal correct,
  interest is a real expense). Needs Plaid Liabilities to split. Disclosed today.
- ✅ **P1-3 Sales tax out of revenue** — `mapStripeCharge` now subtracts the
  invoice tax (Stripe Tax) from recognized revenue (pass-through liability),
  capped at the post-refund amount. (`stripe-map.ts` + test)
- **P1-4 Multi-currency summed blindly** — every sum ignores the `currency` field.
  Guard/flag mixed currency or convert via FX; don't blend.
- **P1-5 Fee currency** — fee uses settlement currency, charge uses presentment;
  bridge subtracts unlike units when they differ.
- ✅ **P1-6 Churn** — now filters cancellations by `canceled_at`/`ended_at` (not
  `created`) and divides by the start-of-window base (active − joined + cancelled),
  via a pure `logoChurnRate`. (`stripe.ts` + tests)
- ✅ **P1-7 MRR coupons** — `subscriptionMrr` applies recurring percent_off /
  amount_off coupons (one-time coupons ignored); tiered/usage prices still 0 until
  `price.tiers` is expanded (documented). (`stripe.ts` + tests)
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
