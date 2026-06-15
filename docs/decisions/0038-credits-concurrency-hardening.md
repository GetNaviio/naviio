# 0038 — Credits concurrency & billing-correctness hardening

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** security-legal-specialist + payments

## Context
A full diagnostics pass (eslint + tsc gates, plus parallel security and correctness
review agents) on the new credits/billing + accrual code surfaced two real
money-correctness bugs and several smaller issues. Gates were green; the bugs were
concurrency/edge-case logic, not type errors.

## Fixes
- **Atomic charge (lost-update / negative balance).** `chargeCredits` previously did
  read-balance → compute → write inside a Read-Committed transaction, so two
  concurrent charges (double-click, two tabs) could both pass a stale read and
  lose a charge. Now uses an **atomic conditional decrement**
  (`updateMany({ where: { balance: { gte: cost } }, data: { balance: { decrement } } })`,
  `count === 0` ⇒ insufficient). Cannot go negative or lose updates.
- **Atomic grant.** `addCredits` now uses `{ balance: { increment } }` (DB-side math)
  instead of read-compute-write.
- **Idempotent purchase.** `CreditLedgerEntry.stripeRef` is now `@unique` (Postgres
  allows multiple NULLs, so charge/refund/grant rows are unaffected). `recordPurchase`
  keeps the fast-path existence check but now relies on the unique constraint and
  catches the P2002 race — a concurrent webhook + return-confirm can no longer
  double-credit one payment. **Requires `prisma db push`.**
- **Defense-in-depth on credit amount.** The webhook and `confirmCreditSession` now
  derive the credit count from the server-defined pack (`packById(metadata.packId)`),
  not the client-visible `metadata.credits` — so a future change to checkout creation
  can't become a free-credit vector.
- **No charge for an empty reply.** The Navi chat route refunds the credit when the
  model streams zero text (not just on a thrown error).
- **No info disclosure on auth failure.** The chat 401 now returns a generic "Please
  sign in" to the client and logs the precise reason (no-cookie vs invalid/expired)
  server-side only.
- **No caching of transient accrual failure.** `/api/pl` skips caching when an
  accounting system is connected but the accrual fetch returned null (likely a
  transient QuickBooks/Xero outage), so the Accrual card isn't hidden for the full TTL.

## Deliberately deferred (nits, not bugs)
- Redundant QuickBooks report fetch when the ledger is empty (default-basis fallback +
  accrual call) — rare accounting-only path; perf-only.
- Client-side hardcoded `realtime_refresh = 3` mirror of `FEATURE_COST` (label only).
- Refund on mid-stream **client abort** is still best-effort (server cancellation may
  skip the catch); the empty-reply case is now covered.

## Verification
- `eslint .` and `tsc --noEmit` both exit 0 after all fixes.
- Pure unit tests (COGS, credit rates, parsers) unaffected.

## Required
- `npx prisma db push` to apply the new unique index on `CreditLedgerEntry.stripeRef`.
