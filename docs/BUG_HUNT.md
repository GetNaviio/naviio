# Naviio — Latent-Bug Investigation (incident-style review)

> 2026-06-10. Proactive deep investigation of the highest-risk paths: credits/
> billing, financial math, sync, auth/MFA. Every finding below was verified
> against the actual code before fixing — several findings from the initial
> sweep were **disproven** and are documented as such (§4). All fixes are in
> and pass typecheck + lint.

## 1. Confirmed bugs, root causes, and fixes

### BUG-1 · Paid Stripe sessions could vanish without a trace — `api/credits/webhook`

**What the code does:** Stripe calls this webhook when a credit-pack Checkout
completes; it verifies the signature and grants credits via `recordPurchase`.

**Root cause:** the grant was gated on `payment_status === 'paid' && orgId &&
pack`. When metadata was missing or `packId` unknown — the realistic case being
a checkout created by a **newer deploy selling a pack this instance doesn't
know** — the condition was simply false: the handler returned `200 received`,
Stripe marked the event delivered and never retried, no log line was written.
Money collected, no credits granted, zero evidence.

**Failure sequence:** deploy N+1 adds "mega pack" → user buys it → Stripe
webhook lands on a lagging instance running deploy N → `packById()` returns
undefined → silent 200 → event gone forever.

**Edge cases considered:** transient DB failure during `recordPurchase` must
NOT be acked with 200 (Stripe should retry), and a retry after a partial
failure must not double-credit — safe here because `recordPurchase` is
idempotent on the unique `stripeRef`.

**Fix:** unresolvable sessions (bad metadata) still ack 200 — retrying can't
fix data — but now log an UNRESOLVED reconciliation line with session id, org
and pack. Persistence failures now return an explicit 500 (Stripe retries)
with a structured log.

### BUG-2 · Failed refund crashed the error path — `api/plaid/refresh`

**What the code does:** metered feature — atomically charges credits, calls
Plaid `/transactions/refresh`, refunds on failure.

**Root cause:** the refund (`addCredits`) lived inside the `catch` block with
no guard. If the DB hiccuped after the charge but during the refund, the catch
itself threw: client got an opaque 500, the refund may or may not have landed,
and nothing was logged for reconciliation.

**Edge cases:** the response must report the *truthful* balance — if the
refund failed, that's the post-charge balance, not the optimistic refunded
one. Ledger consistency is safe in both halves (each is atomic); the gap was
purely the uncoordinated middle and missing audit trail.

**Fix:** refund wrapped in its own try/catch; on refund failure the route
still returns the proper error shape with the post-charge balance and writes a
`REFUND FAILED … reconcile manually` log with org/feature/cost.

### BUG-3 · Passwordless passkey login accepted single-factor assertions — WebAuthn

**What the code does:** passwordless sign-in mints a **full session** from one
passkey assertion (`/api/auth/webauthn/login/verify`), on the stated premise
that "a passkey is a strong factor."

**Root cause:** that premise only holds when the authenticator performs user
verification (PIN/biometric). Options were generated with
`userVerification: 'preferred'` and — decisively — verification never set
`requireUserVerification`. `'preferred'` is a client-side *hint*; a UV=false
assertion (a bare tap on a PIN-less security key, or a tampered client) still
verified. Net effect: possession alone — a stolen USB key — was a full account
takeover, bypassing TOTP entirely on accounts that had it.

**Edge cases:** the *post-password* second-factor ceremony
(`/webauthn/authenticate`) must keep accepting UV=false — the password already
supplied factor one; requiring UV there would break PIN-less security keys
used legitimately as a second factor. Old keys that can't UV simply fall back
to password + TOTP for sign-in.

**Fix:** passwordless options now request `userVerification: 'required'`, and
the verify step enforces `requireUserVerification: true` server-side (hints
can't be trusted). The second-factor ceremony is unchanged.

### BUG-4 · One undated provider row poisoned an entire sync — accounting mappers

**Root cause:** Xero/QBO rows with a missing or unparseable date were mapped to
`new Date(NaN)`. Two consequences: (a) Prisma rejects Invalid Date, and since
sync upserts are batched in one `$transaction`, **a single bad row aborted the
whole org's sync**; (b) had it persisted, month bucketing (`getUTCMonth()`)
yields a `"NaN-NaN"` period key corrupting P&L grouping.

**Edge cases:** Xero's two date formats (`/Date(ms)/` legacy + ISO) both flow
through `parseXeroDate`, which returns Invalid Date on garbage — guarded now.
A skipped row is the correct behavior: a transaction with no date can't be
placed in any reporting period.

**Fix:** both mappers return `null` (skipped, like rows missing an ID) when
the date is absent or unparseable.

### BUG-5 · YTD window shifted by server timezone — `pl-synthesis.ts`

**Root cause:** `new Date(year, 0, 1)` is **local** midnight; the rest of the
codebase (`startOfYearUTC`) uses UTC. On a US-east server, transactions from
Jan 1 00:00–05:00 UTC fell out of the YTD P&L; the bug is invisible on UTC
infra and appears only when deploy region changes — the worst kind.

**Fix:** `Date.UTC(getUTCFullYear(), 0, 1)`, consistent with `ledger.ts`.

## 2. Verified-correct (attempted and disproven)

These were flagged by the initial sweep and **held up under scrutiny** — no
changes made:

- **Credit overdraft race** — `chargeCredits` uses an atomic conditional
  decrement (`updateMany where balance >= cost`) inside a transaction. Two
  concurrent charges cannot overdraw. Correct.
- **Double-credit race (webhook + return-page confirm)** — both paths funnel
  into the unique `stripeRef` constraint; the loser gets P2002, handled as
  "already granted." Correct (constraint-backed, not check-then-act).
- **Ledger/balance divergence** — `balanceAfter` and `CreditAccount.balance`
  are written in the same transaction. Cannot diverge.
- **"Webhook returns 200 on failure"** (initial sweep's top claim) — false: an
  unhandled throw produced a 5xx and Stripe retried. The real bug was the
  *silent-200 metadata path* (BUG-1).
- **Pre-auth (MFA-pending) token escalation** — pre-auth tokens are explicitly
  rejected as sessions; the second-factor ceremony scopes credential lookup by
  `userId`. Correct.
- **Soft-deleted users re-entering via OAuth** — both the provider-link and
  email-match branches of `upsertFederatedUser` reject `deletedAt` users.
  Correct.
- **JWT/cookie expiry alignment, logout clearing** — verified aligned.

## 3. Noted, not fixed (documented trade-offs)

- `dev.log`'s recurring `prisma:error` (`newAccountsAvailable` unknown field)
  was a stale generated client from before the schema gained that column —
  already resolved by `prisma generate`. Residual lesson: `/api/integrations/
  status` swallows DB errors into an empty-but-200 response; consider a 503
  there so the UI can distinguish "nothing connected" from "backend broken."
- `/api/stripe/metrics` computes revenue from the Stripe API independently of
  the transaction ledger; the ledger relies on `isStripePayout` description
  matching to avoid double-counting bank payouts. Heuristic — works, but a
  bank that renders payouts as e.g. "STRIPE INC XFER" should be watched.
  Recommend a reconciliation check post-launch.
- Demo user writes a real org row in non-production (`getDefaultOrgId`
  upserts). By design for demo mode; harmless in prod (gated), shared state in
  dev.

## 4. Verification

`tsc --noEmit` clean, `eslint` clean on all touched files. Fixes are
behavior-preserving except where the behavior *was* the bug (UV enforcement on
passwordless login; skipped undated rows; webhook 500-on-persist-failure).
Manual test suggestions: passwordless login with a platform passkey (Touch ID)
still works; a Stripe CLI `checkout.session.completed` replay with an unknown
packId logs UNRESOLVED and acks 200; the same event with valid metadata
grants credits exactly once across N replays.
