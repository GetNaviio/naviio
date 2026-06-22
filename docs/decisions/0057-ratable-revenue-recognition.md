# 0057 — Ratable revenue recognition (deferred revenue)

## Context
Revenue was recognized 100% on the Stripe charge date (decision 0056). For monthly
plans and one-time charges that's correct cash basis. But an **annual/upfront**
subscription then booked the whole year's amount in the billing month — spiking
that month's income and net margin, and contradicting MRR (which normalizes the
same plan to 1/12 per month). Two surfaces, two different "revenue" for one
customer: a trust-killer. The accounting review's P0-3 called for ratable
recognition, and the user chose deferred revenue over a cash-collections relabel.

## Decision
Recognize subscription revenue **ratably over the service period** when a charge
covers more than ~1 month; everything else is unchanged.

1. **Capture the service window at sync.** `syncStripeData` expands
   `data.invoice`; `mapStripeCharge` reads the longest invoice-line `period` and,
   when it spans > 45 days, stores it on the new
   `Transaction.recognitionStart/recognitionEnd` columns. Monthly plans, one-time
   charges, and all expenses leave them NULL.

2. **Spread in the income statement only.** `expandRevenueRecognition` replaces a
   windowed revenue row with one slice per calendar month it covers (straight-line
   by days; the last slice absorbs the rounding remainder so slices sum exactly to
   the charge). The existing month-bucketing then distributes income correctly.
   `incomeStatement` is the single consumer — **cash flow, burn, and runway are
   untouched** (they stay on the cash side, decision 0056).

3. **Deferred revenue is surfaced.** `IncomeStatement.deferredRevenue` =
   `deferredRevenueAsOf(window end)` — cash collected but not yet earned (the
   unrecognized tail of multi-month charges).

## Why this is robust
- Recognition is driven by the **actual Stripe invoice period**, not a guess.
- Scope is gated to genuinely multi-month charges, so the blast radius is limited
  and existing monthly/one-time behavior is byte-for-byte unchanged.
- Recognized revenue now agrees with MRR for annual plans (both ≈ 1/12 per month),
  removing the cross-surface contradiction.
- Pure, deterministic, and unit-tested (slicing, deferred balance, passthrough).

## Migration
`20260622020000_revenue_recognition_window` adds the two nullable columns
(idempotent `ADD COLUMN IF NOT EXISTS`). Apply via Neon; `prisma generate` on the
build host picks up the fields (the sandbox can't fetch the engine, so source uses
boundary casts that become exact once generated).

## Tests
`tests/lib/revenue-recognition.test.ts`: 12-slice spread summing to the original,
passthrough of one-time/monthly/expense rows, deferred-balance at start/mid/end,
and an `incomeStatement` check that an annual plan books ~1/12 in the billing
month with the rest deferred.
