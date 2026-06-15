# Naviio — System Architecture

> Last updated: 2026-06-10. Reflects the production-readiness pass (Decimal money
> fields, per-org transaction uniqueness, startup env validation, zod input
> validation, rate limiting).

## 1. Overview

Naviio is real-time financial intelligence for SMBs and startups: it connects a
company's bank (Plaid), billing (Stripe), accounting (QuickBooks, Xero), payroll
(Gusto, ADP), and commerce (Shopify, GoHighLevel) accounts, normalizes everything
into one ledger, and serves live P&L, cash flow, MRR/ARR, KPIs, forecasting, and
AI-generated insights.

```
Browser (React 19 / Next.js 16 App Router)
   │  HTTPS (HSTS, CSP, same-origin in prod)
   ▼
Next.js server (ECS Fargate via Docker, or Vercel)
   ├─ src/app/(dashboard)/*   server-rendered views
   ├─ src/app/api/*           REST route handlers
   │     ├─ auth: JWT session cookie (httpOnly) + MFA (TOTP/passkeys)
   │     ├─ rate limiting (Redis fixed-window, in-memory dev fallback)
   │     └─ zod request validation
   ├─ src/lib/integrations/*  provider SDK wrappers + sync orchestration
   ├─ src/lib/metrics/*       P&L / MRR / KPI computation
   └─ src/lib/forecasting/*   scenario + runway engine
   │
   ├──► PostgreSQL (Neon) via Prisma 7 + @prisma/adapter-pg
   │       field-level AES-256-GCM encryption on integration tokens
   ├──► Redis (optional) — cache + rate limits; memory fallback when absent
   ├──► S3 — report storage
   └──► Third parties: Plaid, Stripe, QuickBooks, Xero, Gusto, ADP, Shopify,
        GHL, Anthropic (insights chat), WorkOS (SSO), fal.ai
```

### Request lifecycle

1. **Boot** — `src/instrumentation.ts` runs `validateEnv()`: production refuses
   to start with missing/weak `DATABASE_URL`, `JWT_SECRET`, or
   `TOKEN_ENCRYPTION_KEY`; partially-configured provider key groups log warnings.
2. **Auth** — no global middleware; every protected route calls `requireAuth()` /
   `getSessionUser()` from `src/lib/auth.ts` (JWT in an httpOnly, SameSite=Lax,
   Secure-in-prod cookie). MFA uses a separate short-lived pre-auth token that is
   never accepted as a full session. Soft-deleted users are rejected at session
   resolution.
3. **Validation** — public POST bodies are parsed with zod via
   `src/lib/validate.ts` (`parseBody(request, Schema)` → typed data or a uniform
   400 with field errors).
4. **Rate limiting** — `src/lib/rate-limit.ts` (`rateLimit(request, bucket)`)
   guards login (10/min/IP), register (5/min), waitlist (5/min), MFA verify
   (5/min — 6-digit TOTP is guessable at volume). Redis `INCR`+`EXPIRE` when
   `REDIS_URL` is set; per-process memory otherwise. Fails open so a Redis
   outage can't lock out logins.
5. **Data access** — single Prisma client (`src/lib/prisma.ts`) with two
   extensions: transparent AES-256-GCM encrypt/decrypt of
   `Integration.accessToken/refreshToken`, and Decimal→number conversion for
   money fields at the read boundary.

### Tenancy

Single-owner orgs today: `User 1—N Organization`, and every domain table hangs
off `orgId` with cascade delete. All queries filter by `orgId` derived from the
authenticated session — never from client input. Adding team members later means
introducing a `Membership` join table; no other table changes.

### Background sync infrastructure

All background sync flows through `src/lib/sync/orchestrator.ts`:

```
webhook ─┐
cron ────┼─► enqueueSync({orgId, provider}) ─► runSyncJob
manual ──┘      (queue seam: swap to SQS/        ├─ Redis lock (org+provider)
                 QStash by changing ONE fn)      ├─ 60s cooldown (burst coalescing)
                                                 ├─ SYNC_DISPATCH[provider]()
                                                 └─ idempotent upserts
```

- **Dispatch table** covers the providers that persist data: Plaid (cursor
  sync), Stripe (charges + MRR snapshot), QuickBooks, Xero. Live-fetch
  providers (Gusto/ADP/GHL/Shopify) join by adding one dispatch row when they
  gain persistence.
- **Cron sweep** (`/api/cron/sync`, bearer `CRON_SECRET`): all syncable
  integrations, stalest-first, bounded concurrency (5) — provider API load
  stays constant regardless of org count.
- **Locks + cooldowns** are Redis-backed (`SET NX EX`, atomic) with in-memory
  dev fallback; overlapping cron/webhook/manual runs collapse to one sync.
- Webhook handlers intentionally call their sync directly (not via cooldown):
  a webhook means new data exists — it must never be coalesced away.

## 2. File structure

```
markup-ai/
├── prisma/schema.prisma        # source of truth for the data model
├── src/
│   ├── instrumentation.ts      # boot-time env validation
│   ├── app/
│   │   ├── (auth)/             # login, register, MFA pages
│   │   ├── (dashboard)/        # dashboard, pl, cash-flow, revenue, expenses,
│   │   │                       # kpis, forecast, alerts, integrations, settings…
│   │   ├── api/                # route handlers (see §4)
│   │   └── page.tsx            # marketing landing
│   ├── components/             # layout/, ui/, charts/, integrations/, alerts/
│   ├── hooks/                  # client React hooks (useChartConfig, useThemeColors, useVoiceInput)
│   ├── lib/
│   │   ├── api/with-org.ts     # route wrappers: withAuth / withOrg (single 401 contract)
│   │   ├── auth.ts             # JWT sessions, pre-auth (MFA), cookies
│   │   ├── env.ts              # startup env validation
│   │   ├── validate.ts         # zod schemas + parseBody helper
│   │   ├── rate-limit.ts       # Redis/memory fixed-window limiter
│   │   ├── prisma.ts           # client + encryption + Decimal extensions
│   │   ├── cache.ts            # Redis cache, memory fallback, TTL constants
│   │   ├── crypto.ts           # AES-256-GCM field encryption
│   │   ├── sync/orchestrator.ts# background sync: dispatch, locks, cron sweep
│   │   ├── integrations/       # plaid, stripe, quickbooks, xero, … + mappers
│   │   ├── metrics/            # compute, ledger, mrr, marketing
│   │   ├── forecasting/        # engine
│   │   ├── model/              # income statement synthesis
│   │   └── credits/            # usage-based billing
│   └── types/
├── docs/                       # this file, security/, decisions/ (ADRs), deploy/
├── infrastructure/  deploy/    # AWS / ECS assets
├── Dockerfile                  # multi-stage, non-root, /api/health healthcheck
└── tests/
```

### Layering rules (enforced by convention)

- `src/app/api/*` (interface layer): HTTP parsing, validation, response shaping
  ONLY. Auth/org via `withOrg`; data access through `src/lib` services.
- `src/lib/metrics`, `src/lib/model`, `src/lib/forecasting` (domain): pure
  computation over typed ledger rows; no HTTP, no provider SDKs.
- `src/lib/integrations` (infrastructure): provider SDK wrappers + pure mappers
  into the normalized schema; OAuth callback flow shared via `oauth-callback.ts`.
- `src/lib/{prisma,redis,cache,rate-limit,crypto,env}` (platform): cross-cutting
  technical services, each a single module with one responsibility.
- `src/hooks` + `src/components` (UI): client hooks live in hooks/, never lib/.

## 3. Database schema (Prisma / Postgres)

Auth: `User` (soft-delete via `deletedAt`, 30-day purge — SEC-POL-003),
`Credential` (WebAuthn passkeys), `Account`, `Session`, `VerificationToken`.

Domain: `Organization` (plan, Stripe customer), `Integration` (per-provider
tokens — encrypted at rest, Plaid item + sync cursor, unique `(orgId, provider)`),
`Transaction`, `MrrSnapshot` (per-sub monthly MRR for NRR/waterfall/cohorts,
unique `(orgId, subscriptionId, period)`), `Category` (tree), `Report`, `Alert`,
`TxnClassification` (COGS/OpEx overrides keyed by `externalId` so they survive
re-syncs), `CreditAccount` + append-only `CreditLedgerEntry` (unique `stripeRef`
prevents double-crediting), `Waitlist`.

Conventions this pass locked in:

- **Money is `Decimal(19,4)`, never `Float`** (`Transaction.amount`,
  `MrrSnapshot.mrr`). IEEE 754 drift compounds in P&L math. The Prisma client
  converts to `number` on read so app code does plain arithmetic; `groupBy`
  aggregates bypass result extensions and must wrap with `Number(...)`
  (see `pl-synthesis.ts`).
- **`Transaction.externalId` is unique per org** — `@@unique([orgId, externalId])`,
  not globally. Two orgs syncing the same provider can never collide, and every
  upsert (`where: { orgId_externalId: … }`) is tenant-isolated by construction.
- **Hot-path indexes**: `(orgId, date)`, `(orgId, category)`,
  `(orgId, type, date)` for P&L groupBy, `(itemId)` for Plaid webhook lookups,
  `(orgId, createdAt)` on ledger/alerts.
- `createdAt`/`updatedAt` on all mutable tables.

**Migrations**: schema currently applied with `prisma db push`. Before launch,
baseline once with `npm run db:migrate` (creates `prisma/migrations/`), then
`npm run db:deploy` in CI/prod. Never `db push` against production.

## 4. API surface

All routes are App Router handlers under `src/app/api`. Protected routes call
`requireAuth()`; public routes are listed explicitly.

| Area | Routes | Notes |
|---|---|---|
| Session auth | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | public: register/login — zod-validated + rate-limited |
| MFA (TOTP) | `POST /api/auth/mfa/{setup,enable,verify,disable}` | verify is rate-limited; identity from pre-auth cookie, never the body |
| Passkeys | `POST /api/auth/webauthn/{signup,register,login,authenticate}/{options,verify}` · `GET/DELETE /api/auth/webauthn/credentials` | signup = new account, register = add key, login/authenticate = challenge |
| Federated | `GET /api/auth/google[/callback]` · `GET /api/auth/sso[/callback]` (WorkOS) | state-cookie CSRF protection on both |
| Integrations OAuth | `GET /api/auth/{quickbooks,xero,shopify,gusto,adp,ghl,stripe}[/callback]` | tokens encrypted at rest |
| Plaid | `POST /api/auth/plaid/create-link-token` (gated on MFA — SEC-ATT-001) · `POST /api/auth/plaid/exchange-token` · `POST /api/auth/plaid/refresh` (update mode) · `POST /api/plaid/refresh` (metered, charges credits) · webhook below | |
| Webhooks (public, signature-verified) | `POST /api/auth/plaid/webhook` · `POST /api/auth/stripe/webhook` · `POST /api/credits/webhook` | raw body verified before parse |
| Data & analytics | `GET /api/dashboard` · `/api/metrics` · `/api/pl` · `/api/transactions` · `/api/revenue/movement` · `/api/alerts` (GET/PATCH) | |
| Model & forecast | `GET/POST /api/model` · `/api/model/commentary` · `/api/model/export` (xlsx) · `/api/forecast` · `/api/forecast/scenarios` | |
| AI | `POST /api/insights/chat` (Anthropic; credit-metered) | |
| Sync lifecycle | `POST /api/integrations/sync` · `/api/integrations/disconnect` · `GET /api/integrations/status` | disconnect revokes at the provider |
| Account | `DELETE /api/account/delete` (soft-delete + token revocation) | |
| Credits | `GET /api/credits` · `POST /api/credits/checkout` · `/api/credits/dev-clear` (404 in prod) | ledger is append-only |
| Ops | `GET /api/health` (public, no DB) · `POST /api/cron/sync` · `/api/cron/purge` (bearer `CRON_SECRET`) | |
| Public | `POST /api/waitlist` (zod + rate-limited) · `GET /api/waitlist` (auth) | |

Error contract: `{ error: string }` with proper status; validation failures add
`details: { field: [messages] }`; production never leaks internals (dev gets
detail strings).

## 5. UI architecture

- **App Router route groups**: `(auth)` for unauthenticated pages, `(dashboard)`
  wraps the product in a shared layout (Sidebar + Header).
- **Server components by default**; `'use client'` only where interactivity
  demands it (charts, ChatBot, Plaid Link, forms).
- **Charts**: Recharts wrapped in `src/components/charts/*` with shared theming
  via `chart-config.ts` / `useChartConfig`.
- **Design system**: Tailwind v4 + small primitives in `components/ui`
  (MetricCard, Card, Badge) using `class-variance-authority`.
- **Demo mode**: with no provider keys the app serves realistic mock data; the
  hardcoded demo login is compiled out of production (`NODE_ENV` gate).

## 6. Scaling path (what's already true / what to do at each stage)

| Stage | Already in place | Next step |
|---|---|---|
| 0 → 1k users | Stateless app (JWT cookie), indexes on all hot paths, incremental Plaid cursor sync, Redis-optional caching | Run migration baseline; CI (lint + tsc + jest) |
| 1k → 100k | Per-org unique constraints make horizontal app scaling safe; webhook-driven sync, idempotent upserts | Required Redis (shared rate limits/cache), move sync to a queue (SQS) instead of in-request, structured logging + APM |
| 100k → 1M+ | Append-only credit ledger, org-scoped everything | Read replicas (Neon), partition `Transaction` by org/date, per-org sync schedulers, table-level RLS as defense in depth |

## 7. Security posture (summary — details in docs/security/)

- Tokens AES-256-GCM encrypted at rest; key fails closed in prod (SEC-POL-001)
- MFA enforced before Plaid Link (SEC-ATT-001); pre-auth token ≠ session
- Webhooks signature-verified against the raw body
- Headers: HSTS, X-Frame-Options DENY, CSP (nonce-based script-src is a known TODO)
- Soft-delete + 30-day purge cron (SEC-POL-003)
- Known gaps, tracked: CSRF double-submit token for non-OAuth state changes,
  structured logging, broader zod coverage on authenticated POST routes

## 8. Operational checklist before first real users

1. `npm install` (syncs lockfile for the new `zod` dependency)
2. Rotate every secret currently in `.env` (they've been exposed during dev) and
   move prod secrets to the deploy platform's secret store
3. `npm run db:migrate` once against a fresh dev DB to baseline migrations;
   `npm run db:deploy` in the release pipeline
4. Set `REDIS_URL` in production (rate limiting is per-instance without it)
5. Add CI: `eslint` + `tsc --noEmit` + `jest` on every PR
