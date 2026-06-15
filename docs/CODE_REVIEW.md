# Naviio — Senior Engineering Code Review

> 2026-06-10. Fresh-eyes review of the full codebase: architecture, data flow,
> problem areas, and refactoring strategy. Items marked **[FIXED]** were
> refactored in this pass (behavior-preserving); the rest are prioritized
> strategies. Companion doc: [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. Reverse-engineered data flow

**Ingestion** — OAuth connect (`/api/auth/{provider}` → `/callback`) stores
encrypted tokens on `Integration`. Sync happens through three doors: Plaid and
Stripe webhooks (signature-verified, sync runs inside the webhook handler), a
cron (`/api/cron/sync`, Plaid + Stripe only), and the manual
`/api/integrations/sync` which fans out `fetchAllData(orgId)` across all 8
providers inside the HTTP request. QB/Xero additionally sync inside their OAuth
callbacks (best-effort). Provider payloads pass through pure mapper functions
(`*-map.ts`) into idempotent `Transaction` upserts keyed by `(orgId, externalId)`.

**Compute** — API routes (`/api/metrics`, `/api/pl`, `/api/dashboard`, …) load
~13 months of transactions, aggregate **in JavaScript memory** (not SQL),
cache 15 min in Redis, invalidate on disconnect/delete. MRR/NRR comes from
monthly `MrrSnapshot` rows written during Stripe sync.

**Serving** — all 17 dashboard pages are client components fetching from API
routes in `useEffect`; no server-component data fetching, no Suspense streaming.

## 2. Critical problem areas (ranked)

### P0 — correctness-adjacent

1. **Forecast scenarios stored in a module-level array** — lost on every
   deploy/restart, shared across processes inconsistently, and not org-scoped
   in persistence. (`src/app/api/forecast/scenarios/`) → Persist as a
   `ForecastScenario` table. *Not auto-fixed: needs a schema migration; small,
   do it next.*
2. **Token refresh race** — concurrent requests both refresh, last write wins.
   **[FIXED]** in-process: in-flight refreshes are deduped per integration
   (`refreshToken.ts`). Cross-instance the 5-min buffer makes collisions
   harmless; a DB advisory lock is the eventual fix.

### P1 — scalability ceilings

3. **In-memory aggregation of all transactions** — every metrics request loads
   13 months of rows and reduces in JS. Fine at 1k txns; at 1M-txn orgs it's
   memory + latency death. → Move P&L/burn aggregations to SQL
   (`groupBy date_trunc('month'), type` — the `(orgId, type, date)` index
   already exists), keep JS only for presentation shaping.
4. **Sync inside HTTP handlers** — manual sync, webhooks, and OAuth callbacks
   all do provider fan-out in-request. At scale: slow responses, duplicated
   work when users mash refresh, provider rate-limit storms. → Queue (SQS/
   Upstash QStash) + per-org coalescing (skip if synced < 30s ago).
5. **Six of eight providers have no scheduled sync and no webhooks** — QB,
   Xero, Gusto, ADP, GHL, Shopify data goes stale unless a user manually
   syncs. → extend `/api/cron/sync` to all providers, staggered.
6. **Pagination truncation** — Xero `page=1` only, QB `MAXRESULTS 100`,
   ADP `$top=100`, GHL `limit=100`: orgs with >100 records per window silently
   lose data. This is a **data-correctness bug at scale**, the most important
   non-fixed item in the ingestion layer.
7. **Redis `KEYS` in `delPattern`** — O(keyspace), blocks Redis's single
   thread. **[FIXED]** → cursor-based `SCAN`.

### P2 — duplication / maintainability

8. **8× copy-pasted OAuth callbacks (~320 lines)** — **[FIXED]** → one
   `completeOAuthCallback()` helper (`src/lib/integrations/oauth-callback.ts`);
   each route now declares only its provider-specific exchange + post-connect
   hook (10-20 lines each). Adding provider #9 is now config, not copy-paste.
9. **5× copy-pasted token-refresh functions** — **[FIXED]** → table-driven
   `REFRESH_CONFIG` (one row per provider).
10. **Sequential one-row-at-a-time upserts** in QB/Xero sync loops —
    **[FIXED]** → batched `prisma.$transaction`, matching the Plaid/Stripe
    pattern (100 rows: ~100 round-trips → 1 batch).
11. **2× duplicate Redis clients** (cache.ts + rate-limit.ts) — **[FIXED]** →
    shared `src/lib/redis.ts`.
12. **22 routes repeat auth + org resolution boilerplate** → introduce a
    `withOrg(handler)` wrapper that resolves `{ user, orgId }` once; adopt
    incrementally as routes are touched (mechanical bulk rewrite without tests
    is riskier than the duplication).
13. **5 endpoints recompute overlapping P&L/ledger logic** (`/api/metrics`,
    `/api/pl`, `/api/model`, commentary, chat) → single `getLedgerSummary(orgId,
    window)` in `src/lib/metrics` consumed by all five.
14. **UI duplication** — 7 pages copied the same fetch/loading/error/skeleton
    scaffolding. **[PARTIALLY FIXED]**: `usePageData`/`useApi` hook +
    `SkeletonGrid`/`ErrorState`/`EmptyState` components built and adopted in
    P&L + KPIs; convert remaining pages as touched. Still open: currency
    formatting only via `naviFormat`, hex colors → CSS vars.

### P3 — architecture direction

15. **Client-everything UI** — all 17 dashboard pages are `'use client'` with
    `useEffect` fetching: no streaming, double round-trips, larger bundles.
    Target: server components fetch data directly (skipping the HTTP hop to
    own API), `<Suspense>` per section, client islands only for charts and
    interactions. Do this page-by-page, starting with the read-only ones
    (P&L, KPIs).
16. **Error swallowing** — `errMsg()` helpers log message-only, `.catch(() =>
    console.error(...))` everywhere; an org stuck in `status='ERROR'` is
    undiagnosable. → structured logger (pino) with org/provider context, and
    persist last error reason on the `Integration` row.
17. **Magic numbers in forecasting** (bear 0.5, bull 1.3, churn 0.7 …) →
    named, documented constants in one `assumptions.ts`.

## 3. What's already good (keep)

Pure mapper functions per provider (testable, side-effect free); idempotent
upserts keyed per-org; field-level token encryption centralized in one Prisma
extension; webhook signature verification done correctly (raw body first);
credits ledger is append-only with a unique `stripeRef` (atomic, replay-safe);
soft-delete + purge policy; cursor-based incremental Plaid sync.

## 4. Refactoring roadmap

| Order | Item | Risk | Status |
|---|---|---|---|
| 1 | SCAN not KEYS; shared Redis client | none | **done** |
| 2 | Batch QB/Xero upserts | none | **done** |
| 3 | Table-driven token refresh + in-flight dedup | low | **done** |
| 4 | Shared OAuth callback helper (8 routes) | low | **done** |
| 5 | Persist forecast scenarios (new table) | low | **done** |
| 6 | Pagination loops for Xero/QB/ADP/GHL fetches | low | **done** |
| 7 | Sync orchestrator: cron extended to all persisting providers (Plaid/Stripe/QB/Xero), bounded concurrency, Redis locks + cooldown coalescing, queue-ready seam | medium | **done** |
| 8 | Ledger/provider-set/window helpers consolidated (`loadPrimaryLedger`, `connectedProviders`, `monthsAgoUTC`) across 5 endpoints | medium | **done** |
| 9 | SQL aggregation for metrics | medium | sprint 1 |
| 10 | `withOrg`/`withAuth` wrappers created (`lib/api/with-org.ts`); adopted in model, commentary, scenarios, plaid/refresh — adopt elsewhere as routes are touched | low | **in progress** |
| 11 | Server-component migration, page by page | medium | ongoing |
| 12 | Queue-based sync (SQS/QStash) | high | pre-scale |

Everything marked **done** is behavior-preserving: same redirects, same error
slugs, same persisted fields, same responses — verified by typecheck, lint,
and line-by-line diff against the original routes.
