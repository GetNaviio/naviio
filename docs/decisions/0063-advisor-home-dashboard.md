# 0063 — Advisor home dashboard (fractional-CFO portfolio view)

## Context
The `/dashboard` is built for ONE business. A fractional CFO has a *portfolio* of
client orgs and (usually) an empty own-org, so they'd land on a bank-connect
prompt and had to click into each client one at a time via the org switcher. They
needed a home that answers "which of my clients needs me today?" without N clicks.

## Decision
A new **Advisor Home** (`/advisor`) — the CFO's whole book at a glance.

1. **Aggregation API** `GET /api/firm/clients/vitals` (`withAuth`, no single-org
   context). Resolves the advisor's firm (`getFirmIdForUser`), lists client orgs
   (`listFirmClients`), and for EACH (in parallel) computes a compact vitals set:
   cash, runway, net margin, MoM revenue growth, an industry-graded Navi score,
   a triage status, and attention reasons.
   - Re-verifies per-client access with `getRole` (firmId is an org link, not an
     auth grant — a revoked client leaves a dangling firmId → shown as
     "needs reconnect", never errors).
   - `getCashBalance` (live Plaid) is wrapped in a 5s timeout and all clients run
     in parallel, so one slow client can't stall the roster. Cached per firm
     (`firm:{id}:vitals`, TTL.MEDIUM). `getCommunityPrior()` fetched once.
2. **Triage logic** is the pure `deriveVitals` (`src/lib/firm/vitals.ts`): score
   via `scoreProfitability/RevenueGrowth/Liquidity` (industry bands) →
   `overallScore`; status `at_risk` (runway < 3mo, loss, or score < 50) / `watch`
   (< 6mo or < 70) / `healthy`, plus `no_data` / `needs_reconnect`. Unit-tested.
3. **Page** (`/advisor`): portfolio rollup (clients, healthy/watch/at-risk, total
   cash), a cross-client "needs attention" feed (click → open that client), and a
   roster table (score, cash, runway, net margin, rev MoM, status, Open). "Open"
   POSTs `/api/org/switch` then `/dashboard` (existing pattern).
4. **Nav + routing.** Sidebar gains an `/advisor` entry (`firmOnly`, like Clients).
   `/api/metrics` now returns `viewingOwnOrg`; the dashboard sends an advisor
   sitting on their OWN empty org to `/advisor` — but never when they've opened a
   client (`viewingOwnOrg=false`) or have their own books, so opening a client
   isn't bounced.

## Why
- Every metric function takes an explicit `orgId` (no session coupling), so the
  same engine that powers a single dashboard composes over N clients safely.
- Reuses the industry-tuned score so each client is graded on its own curve.

## Migration
None new — uses `User.accountType` (`20260622040000`, already in the deploy SQL).

## Tests
`tests/lib/vitals.test.ts` — access/no-data/healthy/at-risk/watch/cash-positive
status + score presence. (tsc-checked; jest runs on the build host — `vitals.ts`
imports scoring via `@/` alias so ts-node can't load it standalone.)

## Deferred
Aggregate book metrics (total MRR/ARR across clients), per-client sparklines,
saved client filters/sorting, and a scheduled "morning digest" of at-risk clients.
