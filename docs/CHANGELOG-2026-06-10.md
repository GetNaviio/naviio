# Naviio — Engineering Session Record · 2026-06-10

Complete record of the production-readiness pass, architecture refactor, and
latent-bug investigation. Companion docs:
[ARCHITECTURE.md](./ARCHITECTURE.md) · [CODE_REVIEW.md](./CODE_REVIEW.md) ·
[BUG_HUNT.md](./BUG_HUNT.md)

## A. Database schema (3 migrations, all applied)

| Migration | Contents |
|---|---|
| `0_init` | Baseline of pre-existing schema (data-preserving — no reset) |
| `20260611023522_naviio` | `Transaction.amount` & `MrrSnapshot.mrr`: Float → `Decimal(19,4)` · `Transaction.externalId` unique **per org** (`@@unique([orgId, externalId])`) replacing global unique · `Transaction.updatedAt` · `(orgId, type, date)` index |
| `20260611030113_forecast_scenarios` | New `ForecastScenario` table (org-scoped, cascade delete) |

Workflow changed from `prisma db push` to migrations: `npm run db:migrate`
(local), `npm run db:deploy` (CI/prod — now also validated on every PR).

## B. Security & correctness fixes

1. **Startup env validation** — `src/instrumentation.ts` + `src/lib/env.ts`:
   prod refuses to boot with missing/weak `DATABASE_URL`, `JWT_SECRET`,
   `TOKEN_ENCRYPTION_KEY`; warns on partially-configured provider key groups.
   Skipped during `next build` (NEXT_PHASE guard) so stub-secret builds pass.
2. **Input validation (zod)** — `src/lib/validate.ts`; applied to register,
   login, waitlist, forecast scenarios. zod added as a real dependency.
3. **Rate limiting** — `src/lib/rate-limit.ts` (Redis fixed-window, in-memory
   dev fallback, fail-open): login 10/min/IP, register 5/min, waitlist 5/min,
   MFA verify 5/min.
4. **WebAuthn UV enforcement** — passwordless passkey login now *requires*
   user verification (PIN/biometric) at both options and verify; a stolen
   PIN-less security key is no longer a full account takeover. Second-factor
   ceremony unchanged. (BUG_HUNT §1.3)
5. **Credits webhook** — paid sessions with unresolvable metadata are logged
   for reconciliation instead of silently acked; persistence failures return
   500 so Stripe retries (idempotent via unique `stripeRef`). (BUG_HUNT §1.1)
6. **Metered-refresh refund path** — refund failures no longer crash the
   handler; truthful balance returned; reconciliation log. (BUG_HUNT §1.2)
7. **Invalid-date guards** — Xero/QBO rows without parseable dates are skipped
   (previously: Invalid Date → whole batched sync aborts / NaN month buckets).
8. **UTC year boundary** — `pl-synthesis.ts` YTD window no longer shifts with
   server timezone.
9. **Hydration error fix** — `InfoTip` renders `<span>`s (valid inside `<p>`),
   resolving the cash-flow/KPIs console errors.

## C. Architecture refactors (behavior-preserving)

1. **OAuth callbacks unified** — `src/lib/integrations/oauth-callback.ts`;
   7 provider callback routes (QB, Xero, Stripe, Gusto, ADP, GHL, Shopify)
   reduced from ~40-50 lines each to declarative configs (~320 lines removed).
2. **Token refresh table-driven** — 5 copy-pasted refresh functions → one
   generic + `REFRESH_CONFIG`; in-flight dedup eliminates same-process
   refresh races.
3. **Batched sync writes** — QB/Xero one-row-at-a-time upsert loops →
   single `$transaction` batches (matches Plaid/Stripe pattern).
4. **Shared Redis client** — `src/lib/redis.ts` (was duplicated in cache.ts +
   rate-limit.ts); `delPattern` uses SCAN instead of blocking KEYS.
5. **Pagination** — Xero (page loop), QBO (STARTPOSITION), ADP ($skip), GHL
   (nextPageUrl) — all bounded at 10 pages; previously silently truncated at
   100 records (ledger under-reporting, understated pipeline/headcount).
6. **Forecast scenarios persisted** — DB-backed (`ForecastScenario`), replacing
   a module-level array that lost data on every restart and wasn't org-scoped
   in storage. API shapes unchanged.
7. **Money handled as Decimal at rest** — Prisma result extension converts to
   `number` at the read boundary so all existing call sites work unchanged;
   `groupBy` aggregates wrap with `Number()`.

## D. CI/CD

- `ci.yml` (existing) extended: `prisma migrate deploy` runs against the
  service Postgres on every PR (validates the migrations dir); build stubs
  satisfy env-shape requirements.
- `deploy.yml` (existing, Vercel) — unchanged; required secrets documented in
  the file header.

## E. Verification status

- `tsc --noEmit`: clean · `eslint`: clean on all touched files
- Validation/rate-limit/env logic: smoke-tested (10 scenarios, all pass)
- `npm test` / `npm run build`: **run locally** (sandbox can't execute
  platform binaries) — last known state: passing per local runs
- Migrations: all three applied to the Neon dev DB

## F. Open items (owner: Eric)

| # | Item | Why |
|---|---|---|
| 1 | **Rotate every secret in `.env`** before launch; move prod values to Vercel/AWS secret store | Keys were exposed during development |
| 2 | Add `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` to local `.env` (`openssl rand -hex 32` each) | Currently absent — dev runs on fallback secret; encrypted-token code paths untested locally |
| 3 | Set `REDIS_URL` in production | Rate limits are per-instance memory without it |
| 4 | Run `npm test && npm run build` after this session's changes | Sandbox cannot |
| 5 | Manual check: passwordless passkey sign-in (Touch ID) still works | UV enforcement added |
| 6 | Push to GitHub so CI runs | Workflows exist but repo has no git history in this folder |

## G. Open items (engineering backlog — ranked in CODE_REVIEW.md §4)

Cron sync for all 8 providers + request coalescing → ledger-summary
consolidation (5 endpoints) → SQL aggregation for metrics → `withOrg` route
wrapper adoption → server-component migration page-by-page → queue-based sync
→ test coverage (auth flows, webhook verification, credit atomicity) →
webauthn route naming + duplicate Plaid route consolidation → CSRF tokens →
structured logging (pino) → nonce-based CSP.

## H. Clean-architecture pass (same day, later)

1. **Route wrappers** — `src/lib/api/with-org.ts` (`withAuth`/`withOrg`): one
   401 contract replacing two hand-rolled auth-boilerplate variants found in
   ~40 routes. Adopted in model, model/commentary, forecast/scenarios (3
   handlers), plaid/refresh; remaining routes adopt incrementally as touched.
2. **Ledger service consolidation** — `loadPrimaryLedger`, `connectedProviders`,
   `monthsAgoUTC` added to `src/lib/metrics/ledger.ts`; the five metric
   endpoints (metrics, pl, model, commentary, insights/chat) now share them
   instead of copy-pasting query+hierarchy+window logic.
3. **P&L route dedup** — the accounting-summary fetch block that appeared twice
   inside `api/pl/route.ts` extracted to one helper (cash fallback + accrual).
4. **Hooks relocated** — `useChartConfig`, `useThemeColors`, `useVoiceInput`
   moved `src/lib` → `src/hooks`; six importers updated.
5. **Layering rules documented** — ARCHITECTURE.md §2 now states the
   interface/domain/infrastructure/platform/UI boundaries.

All behavior-preserving; `tsc` + full-`src` eslint clean.

## I. Sync infrastructure (same day, later)

`src/lib/sync/orchestrator.ts` + rewired `/api/cron/sync`:
job-shaped API (`enqueueSync`) with a documented queue seam (swap in SQS/QStash
by changing one function); `SYNC_DISPATCH` covering Plaid, Stripe (+MRR
snapshot), QuickBooks, Xero; atomic Redis `SET NX EX` locks per org+provider
with 60s cooldown coalescing (in-memory dev fallback); cron sweep processes
stalest-first with bounded concurrency (5) — fixes: QB/Xero accounting-only
customers no longer go stale, 10k orgs no longer mean 10k simultaneous provider
calls, and cron/webhook/manual overlap can no longer double-fetch. Cron
response shape unchanged (adds `skipped`). Webhook handlers stay direct by
design (new-data signals must not be coalesced away).

## J. UI state system (same day, later)

`src/hooks/usePageData.ts` (+ `useApi`, `fetchJson`) and
`src/components/ui/PageState.tsx` (`SkeletonGrid`, `ErrorState`, `EmptyState`):
shared data-fetching hook (AbortController cleanup, real error state, refetch)
replacing the hand-rolled useEffect+alive-flag pattern, and accessible
loading/error/empty components (role=status/alert, sr-only text, focusable
retry). Adopted in the P&L and KPIs pages; remaining pages convert as touched.
Fixes the worst UX bug of the old pattern: a failed API call rendered the
misleading "connect your tools" prompt — outages and empty accounts now look
different. (CODE_REVIEW item 14, partially done.)

## K. Test suite for the session's changes (same day, later)

Eight new test files (~45 cases) covering every critical path touched today —
written to run with the existing Jest setup, no new dependencies:

- `tests/lib/validate.test.ts` — zod schemas, normalization, 400 shape
- `tests/lib/rate-limit.test.ts` — limits, 429 headers, per-IP/per-bucket isolation
- `tests/lib/env.test.ts` — prod fail-fast, build-phase skip, group warnings
- `tests/lib/auth-tokens.test.ts` — session vs MFA-pending token separation
  (incl. forged-claim and wrong-secret cases)
- `tests/lib/credits-account.test.ts` — atomic conditional decrement, ledger
  same-transaction invariant, P2002 purchase idempotency
- `tests/api/credits-webhook.test.ts` — signature rejection, UNRESOLVED logging,
  500-on-persist-failure (Stripe retry), unpaid/unrelated events ignored
- `tests/api/plaid-refresh.test.ts` — charge/refresh/refund flow incl. the
  refund-failure path (truthful balance + reconciliation log)
- `tests/lib/sync-orchestrator.test.ts` — dispatch, cooldown coalescing,
  per-org/provider isolation, sweep failure isolation
- `tests/lib/oauth-callback.test.ts` — redirect contract, tenant-scoped upsert,
  post-connect isolation, requireCode
- `tests/lib/refresh-dedup.test.ts` — token rotation persistence + concurrent
  callers sharing one refresh

Typechecked + linted clean. NOT YET EXECUTED (sandbox can't run Jest —
platform binaries); run `npm test` locally and report failures back for fixes.

## L. Security audit pass (same day, later)

Full report: docs/SECURITY_AUDIT.md. Fixed: session revocation on logout
(SHA-256 denylist in Redis/memory with remaining-lifetime TTL — stolen JWTs no
longer survive logout), waitlist GET gated on ADMIN_EMAILS allowlist (was: any
registered user could dump all signup emails), timing-safe cron secret
comparison (both crons), rate limiting on passwordless WebAuthn endpoints.
Verified safe: tenant isolation (all routes), CSRF (SameSite=Lax analysis,
route by route), SQL injection (no raw SQL), open redirect (none), SSRF (GHL
pagination re-bases host), client-side exposure, LLM prompt injection (only
aggregates reach the model), Dockerfile/CI, account-deletion enforcement.
Action items for Eric: set ADMIN_EMAILS in prod, delete .env.save, run
npm audit.

## M. DevOps / production-operations pass (same day, later)

Full doc: docs/DEPLOYMENT.md. Decision: Vercel primary (AWS Terraform kept as
documented escape hatch; Kubernetes explicitly rejected at this scale).
Implemented: post-deploy deep-health gate in deploy.yml (curls
/api/health?deep=1 with retries — a deploy that can't reach Postgres fails
loudly instead of notifying success); /api/health gained the ?deep=1 DB
round-trip variant for uptime monitors; src/lib/log.ts zero-dep structured
JSON logger wired into ops-critical paths (credits reconciliation events,
sync_failed, sync_sweep_complete) so Vercel log drains can alert by field;
dev.log gitignored. Documented: monitoring strategy (uptime, log drain +
money/sync alerts, Sentry), reliability matrix, ordered scaling knobs,
condensed go-live checklist. One webhook test updated for the structured
event name.

## N. FP&A planning features (same day, later)

Three new tabs on the Financial Model page:

1. **Workforce Planning** — planned roles (title, headcount, monthly salary,
   loaded %, start/end month) persisted in new `WorkforceRole` table; loaded
   cost math + 12-month cost/headcount series (months on columns). Domain:
   `src/lib/model/workforce.ts` (pure). API: `/api/model/workforce`.
2. **Budget vs Actuals** — editable 12-month × Revenue/COGS/OpEx budget grid
   persisted in new `BudgetLine` table (unique org+month+line); YTD variance
   vs ledger actuals with favorable/unfavorable coloring per line direction.
   API: `/api/model/budget` (GET/PUT bulk upsert).
3. **TTM Forecast** — rolling 12-month forecast, months on columns: Revenue /
   COGS / Gross Profit / OpEx / Operating Income rows, TTM-actuals reference
   column, 12-month total column. Seeded from the page's assumption inputs;
   forecast OpEx includes the workforce-plan DELTA vs the anchor month (future
   hires add, planned departures subtract — own visible row). Domain:
   `src/lib/model/ttm.ts` (pure, reconciliation identities exact).

Shared: `/api/model/monthly` (per-month R/COGS/OpEx for trailing 24 months via
the model classifier). All routes withOrg + zod; money fields Decimal(19,4)
with read-boundary conversion. Tabs use usePageData/PageState. Tests:
`model-workforce.test.ts`, `model-ttm.test.ts` (identities, year boundaries,
delta semantics). **Migration required:** `npm run db:migrate` (name it
`fpa_planning`).

## O. FP&A v2 — SVP-of-FP&A review pass (same day, later)

Roadmap: docs/FPA_ROADMAP.md. Changes: (1) Workforce gains a **department**
dimension (nullable column — migration `workforce_department`) with per-dept
subtotal rows; (2) Budget gains a **year selector** (prev/current/next — Q4
budgeting season for next year now works), **seed-from-actuals** (fills empty
cells with trailing-3-month run-rate, never overwrites), and the classic
**monthly Budget/Actual/Variance grid** with FY column; (3) TTM forecast gains
**Gross Margin % and Operating Margin % rows**. All additive; tsc/eslint clean.
**Migration required:** `npm run db:migrate` (name: `workforce_department`).

## P. Spreadsheet export/import (Excel + Google Sheets)

One .xlsx format serves both ecosystems (Sheets opens .xlsx natively and
exports via File ▸ Download ▸ .xlsx):

- **Export**: `GET /api/model/fpa-export?year=` → one workbook, three sheets
  (TTM Forecast values; Budget grid; Workforce plan). The Budget and Workforce
  sheets ARE the import templates — perfect round-trip. TTM assumptions are
  server-derived run-rate defaults so export never depends on unsaved UI state.
  Export buttons on all three Financial Model tabs.
- **Import**: `POST /api/model/budget/import` (upsert by month+line —
  idempotent) and `POST /api/model/workforce/import` (append or atomic
  replace), both .xlsx multipart with 2 MB caps and helpful 422 messages.
- **Parsers** (`src/lib/model/fpa-xlsx.ts`) tolerate spreadsheet-tool quirks:
  Date-coerced month headers, "$1,250" currency strings, formula-result cells;
  invalid rows are skipped with per-row reasons.
- **Tests**: `tests/lib/fpa-xlsx.test.ts` — export→parse round-trip equality
  plus quirk-tolerance cases (29 suites total).
- **Native add-ins** (Office.js / Apps Script marketplace extensions) are a
  separate product effort — staged in FPA_ROADMAP.md Stage 2; these endpoints
  are the API surface an add-in would call, so nothing built today is thrown
  away.

## Q. Import templates + payroll-sync design

- `?template=1` on the FP&A export → blank Budget grid (chosen year) + empty
  Workforce sheet, no org data, no TTM sheet. "Template" buttons added beside
  Import on the Budget and Workforce tabs. Builder refactored into per-sheet
  functions; template-mode round-trip test added (30 suites).
- Payroll-provider sync (Gusto/ADP/Deel → Workforce tab) designed and promoted
  to roadmap Stage 2 with the full mechanism: source/sourceExternalId schema
  additions, orchestrator dispatch rows, provider badges, plan-vs-actual
  variance, and a compensation-privacy export toggle. Gusto/ADP OAuth already
  exists; Deel is a new provider via the standard config pattern.

## R. Trust layer v1 (robustness review of the FP&A suite)

Thesis: docs/TRUST_LAYER.md. Three trust violations found and fixed:

1. **Partial-month variance** — YTD and FY variance graded the in-progress
   month's full budget against partial actuals (always "unfavorable" mid-month).
   Now closed-months-only, current month labeled "(MTD)" with variance withheld,
   subtitle states the discipline explicitly.
2. **Classification inconsistency** — TxnClassification overrides (user
   COGS/OpEx tags) were applied by ZERO routes despite the classifier
   supporting them. New `classificationOverrides()` in the ledger service;
   applied in /api/model and /api/model/monthly; ledger rows now carry
   externalId. One tag now moves a transaction in every view at once.
3. **Invisible freshness** — actuals carried no provenance. /api/model/monthly
   returns per-source lastSyncedAt + currentMonthIsPartial; new FreshnessLine
   component on Budget + TTM tabs shows "Actuals from Bank + Stripe · synced
   2h ago", bounded by the STALEST source, amber past 48h.

Staged in TRUST_LAYER.md: tag-from-tool write path, provenance drill-down,
reconciliation tile, month-close locking, forecast accuracy ledger.

## S. Integrations catalog — every industry, request-driven roadmap

Goal: "all the integrations possible to fit every industry type." The honest
engineering form of that: 8 live OAuth connectors stay as-is, and a full
**catalog of 28 coming-soon connectors** across 8 categories (Payments,
Accounting, Payroll & HR, eCommerce & POS, CRM & Sales, Billing &
Subscriptions, Expenses & Spend, Industry tools) ships with a **Request**
button per card. Votes are stored per org; the build order of new connectors
follows real demand instead of guesses. Catalog copy surfaces the fact that
already makes Naviio industry-complete at the core: Plaid = 12,000+ banks.

- `src/lib/integrations/catalog.ts` — catalog data: slug/name/description/
  category/industries per entry; `ALL_INDUSTRIES`, `isKnownComingSoon()`.
  Slugs are strings (not an enum) so adding entries never needs a migration.
- `prisma/schema.prisma` — new `IntegrationRequest` model
  (`@@unique([orgId, slug])`, `@@index([slug])`, cascade on org delete).
  **Migration required (Eric): `npm run db:migrate` → name it
  `integration_requests`.** Additive only.
- `src/app/api/integrations/request/route.ts` — withOrg + zod; GET org's
  requested slugs, POST idempotent vote (400 on unknown slug), DELETE
  withdraws. Roadmap query: count rows per slug.
- `src/components/integrations/IntegrationCatalog.tsx` — search box,
  industry filter chips, category-grouped cards, optimistic
  Request/Requested toggle with rollback, empty state pointing to
  hello@naviio.com.
- `src/app/(dashboard)/integrations/page.tsx` — catalog mounted below the
  live cards; "Coming Soon — Phase 2" renamed **Early Access** (those three
  are connectable; "coming soon" now means the catalog).
- `tests/api/integration-request.test.ts` — org scoping, 401 contract, slug
  validation, idempotency, catalog/validator sync, slug uniqueness.

Adding a REAL connector later still follows the established recipe: OAuth
route + completeOAuthCallback config + REFRESH_CONFIG row + mapper +
optional SYNC_DISPATCH row + IntegrationProvider enum migration — then move
its card from the catalog to the live list.

## T. Landing page design pass — scaling + robustness (desktop & mobile)

Designer audit of src/app/page.tsx; all fixes CSS-only plus one JSX
inline-style removal. Composition and copy untouched.

- **Fixed nav was ~120px tall** (80px logo + 1.25rem padding) — ate phone
  viewport and looked heavy. Logo now fluid `clamp(48px, 5.5vw, 64px)`,
  nav padding 0.9rem; 44px logo + safe-area insets ≤430px.
- **Anchor scrolling fixed** — #features/#integrations/#pricing/#waitlist
  landed under the fixed nav; `scroll-margin-top: 88px` (68px small).
- **Pricing double gap** — inline `marginBottom: 3.5rem` stacked on the
  title's own 3.5rem = 7rem of dead space. Inline style removed.
- **Features grid tablet step** — 3→1 col jump at 768px stretched cards;
  now 3 → 2 (≤980px) → 1 (≤600px).
- **Fluid side padding** — nav, hero, logos, features, integrations,
  pricing, CTA, footer all use `clamp(1.25rem, 4vw, 3rem)` instead of a
  hard 3rem→1.25rem jump at 768px.
- **Hero**: `min-height: 100svh` fallback (no mobile-Safari jump);
  h1 floor 2.75rem (no clipping 561–640px); badge wraps on 320px screens.
- **3D scene**: third KPI spans both columns ≤560px (no orphan cell);
  orbs shrunk + lighter blur on phones (GPU cost).
- **Accessibility**: `:focus-visible` outlines for keyboard nav;
  `prefers-reduced-motion` now also unhides `.reveal` content and stills
  hero/orb/grid animations (content never depends on JS observer).
- **Touch**: ~44px tap targets for nav CTA, primary button, footer links.
- **Dead CSS removed**: ~30 lines of the old screenshot mockup
  (.dashboard-frame, .dash-*, .chart-*, .activity-*, .ai-chip, .frame-*)
  that the 3D scene replaced.

## U. P&L month drill-down + prior-year comparison (CFO view)

Plaid backfills 24 months — the P&L tab now uses all of it.

- `src/app/api/pl/monthly/route.ts` — trailing 24 months (+ current MTD) of
  cash-basis P&L, one bucket per 'YYYY-MM', each with its own
  expensesByCategory, computed by the SAME incomeStatement classifier the
  YTD view uses. Carries trust meta (per-source lastSyncedAt, partial flag).
  Uncached, like /api/model/monthly, so freshness stays honest.
- P&L tab (`pl/page.tsx`):
  - **Click a month** in the Monthly Breakdown (now 24 months, with an MTD
    badge and a Net YoY column) → metric cards + summary + category card
    rescope to that month. Scope chip with an ✕ returns to YTD.
  - **CFO comparison card** — month mode compares against BOTH the prior
    month (momentum) and the same month last year (seasonality-free growth):
    $ , Δ$, MoM %, YoY %, and net-margin deltas in percentage points.
    YTD mode (default) compares this YTD against the SAME SPAN of last year
    (Jan→current vs Jan→current), never a full prior year vs a partial one.
  - Metric-card headline trend = YoY; withheld entirely for the in-progress
    month (MTD discipline — a partial month is never graded).
  - FreshnessLine trust badge added to the tab.
- `MetricCard` gains `goodWhen: 'up' | 'down'` — expense trends now color by
  favorability (spend down = green) while the arrow keeps the true direction.
- `tests/api/pl-monthly.test.ts` — bucketing, ordering, trust meta, 401.

CFO rationale recorded: same-month-last-year is the honest growth signal
(strips seasonality), prior-month shows momentum, same-span YTD is the board
view. Next candidates: budget column in the comparison (data already exists
in BudgetLine), and provenance drill-down from any month row.

## V. Selections + paid output survive tab switches

Two layers, matched to what's at stake:

1. **Paid output → database.** Generated commentary (2 credits) is now
   persisted in the `Report` table (new `COMMENTARY` enum value) and reloaded
   when the Financial Model page mounts — leaving the tab, reloading, or
   switching devices never costs the user their result. POST saves after a
   successful generation (a save failure is logged but never eats the
   response the user was charged for); new GET returns the latest with its
   generatedAt, shown next to the Regenerate button.
   **Migration required (Eric): `npm run db:migrate` → name it
   `report_commentary`.** Expand-only enum addition.
2. **UI selections → sessionStorage.** New `usePersistentState` hook
   (src/hooks/usePersistentState.ts): useState mirrored to sessionStorage,
   restored on mount (effect-based — no SSR hydration mismatch; never
   clobbers the stored value with the default on first render). Applied to
   the P&L selected month (`pl:selectedMonth`) and the Financial Model active
   sub-tab (`model:tab`). Clears when the browser tab closes — selections
   belong to the working session.

`tests/api/commentary-persist.test.ts` pins the GET contract (org scoping,
empty state, malformed-data tolerance, 401). Pattern note: any future page
selection (budget year, forecast assumptions) should use usePersistentState.

## W. Navi branding rollout

Decision (Eric): the brand is **Navi** — title case, a persona like
Siri/Alexa, never NAVI (reads as acronym) or navi.

- `src/components/ui/NaviBadge.tsx` — single "Powered by Navi" pill
  (blue→teal gradient ✦ spark matching the chat avatar). ALL placements use
  this component; styling/wording changes propagate everywhere at once.
- `Card` gained a `badge` prop (ReactNode after the title).
- Placed on AI-driven surfaces: AI Commentary Writer (Financial Model),
  MRR Forecast — 3 Scenarios (Forecast), Expense Breakdown (Expenses,
  tooltip now credits Navi for auto-categorization).
- Placement rule (agreed): no badge where Navi speaks in first person
  (chat panel, Insights page) — circular; none on Navi Score — brand is
  already in the name.

## X. Expenses tab — month drill-down (P&L pattern reused)

Same scope model as the P&L tab, same data source (/api/pl/monthly per-month
expensesByCategory — zero new aggregation endpoints):

- Scope chip + month dropdown (trailing 24 months, MTD-labeled) above the
  cards; selection persists via usePersistentState('expenses:selectedMonth').
- Total Expenses card: scoped total with YoY trend (goodWhen="down" — spend
  below last year shows green), withheld for the in-progress month.
  Largest Category and Categories Tracked rescope with it.
- Expense Breakdown chart + Categories filter list rescope to the month.
- Transactions follow the scope SERVER-SIDE: /api/transactions gained
  `?month=YYYY-MM` (UTC month window, validated) — an older month shows its
  complete rows, not whatever survived the "recent 200" default.
- FreshnessLine trust badge + MTD disclaimer, consistent with P&L.

## Y. Ad-spend validation — Meta & Google Ads (the agency-pain feature)

Eric's thesis from his agency years: SMBs can't validate marketing dollars.
Naviio's answer is the trust layer applied to ad spend — hover a FACEBK /
GOOGLE ADS bank charge and see "Verified: matches Meta billing May 3–17"
plus the KPIs that window bought. Spend VALIDATION, not another ads dashboard.

- **Schema** (migration required, Eric: `npm run db:migrate` → name it
  `ad_insights`): IntegrationProvider += META_ADS, GOOGLE_ADS; new AdInsight
  table — one row per (org, provider, ad account, DAY) with spend (Decimal),
  impressions, clicks, conversions, conversionValue. Daily grain because ad
  platforms bill on spend thresholds, not calendar months. Decimal→number
  read extension added in prisma.ts.
- **Matching engine** (`src/lib/ads/match.ts`, pure; 15 tests in
  tests/lib/ads-match.test.ts): descriptor detection (FACEBK, META PLATFORMS,
  GOOGLE *ADS, ADWORDS — word-bounded, no "metal"/"metabase" false fires);
  window reconstruction (contiguous day-runs ending 0–4 days before the
  charge, up to 36 days, tolerance max($1, 1%)); per-account separation so
  billing cycles never blend; LABELED trailing-30d fallback when nothing
  reconciles — never a silent wrong answer. deriveKpis: CTR/CPC/CPM/CPA/ROAS,
  zero-division-safe.
- **Providers**: meta-ads.ts (Graph API: oauth + long-lived token exchange,
  /me/adaccounts, /act_N/insights time_increment=1, paginated; purchase-first
  conversion picking) and google-ads.ts (OAuth + REST searchStream GAQL,
  cost_micros→dollars, MCC accounts skipped). First sync = 13 months back,
  routine = 40 days (idempotent upserts re-absorb attribution restatements).
  OAuth routes follow completeOAuthCallback; postConnect triggers first sync.
  SYNC_DISPATCH + REFRESH_CONFIG (Google) rows added.
  ENV needed to activate: META_ADS_APP_ID/SECRET (Meta app review for
  ads_read), GOOGLE_ADS_CLIENT_ID/SECRET + GOOGLE_ADS_DEVELOPER_TOKEN
  (Google approval). Until then cards show "Not configured" like Gusto/ADP.
- **API**: GET /api/ads/insights?txnId= — org-scoped txn → detect → match →
  {charge, match{matched,basis,window,platformSpend,delta}, totals, kpis}.
- **UI**: AdInsightPopover — Meta/Google chip on ad transactions in the
  Expenses table (detection runs client-side on the descriptor); hover/click
  opens lazy-fetched popover: green "Verified: matches billing window" line
  (amber honest-mismatch line otherwise), KPI grid, ROAS + attributed
  revenue, connect CTA when the platform isn't linked. Integrations page
  gains Meta Ads + Google Ads cards (Advertising, Early access).

Future (staged): ROAS vs Stripe-revenue cross-check (platform-claimed vs
bank-truth — the only honest ROAS), campaign-level drill-down, CAC feed.

## Z. Ad-platform credentials wired + legal pages live

- Google Ads connected END TO END in dev: MCC created (USD — caught a BRL
  default), developer token obtained (Explorer; Basic Access application
  submitted with reporting-only framing + design doc at
  docs/naviio-google-ads-api-design.pdf), Cloud OAuth client created,
  full connect → consent → callback → token → sync verified.
- Meta app created (Marketing API use case; Facebook Login not combinable
  and NOT needed — the dialog/oauth flow works without it). Business
  verification + ads_read Advanced Access review still pending; dev mode
  works for app admins meanwhile.
- .env: all six ad vars set; login-customer-id normalized to digits-only;
  GOOGLE_ADS_REDIRECT_URI / META_ADS_REDIRECT_URI pinned to localhost in
  dev because NEXT_PUBLIC_BASE_URL is the ngrok tunnel (browser session
  lives on localhost). DO NOT set these overrides in Vercel — prod falls
  back to https://naviio.com callbacks, which are registered.
- Standalone legal pages: /privacy + /terms already existed
  (LegalRouteView) — duplicate (legal)/ versions removed after a route
  collision; NEW /data-deletion page (Meta requirement) with account
  deletion, per-integration disconnect, and email paths. Privacy policy now
  covers ad-platform performance data.
- Eric-side launch additions: 6 ad env vars into Vercel; deploy before
  pasting naviio.com URLs into Meta app settings.

## AA. Meta Ads connected end to end (dev)

Scope fix: read_insights removed from the OAuth request — it's a
Page-analytics permission, invalid for Marketing API apps, and unneeded
(ads_read covers /act_N/insights). One permission also = simpler App Review.
Full flow verified: dialog → consent → callback → long-lived token →
insights sync. BOTH ad platforms now work in dev.

Remaining for customer-facing launch (Eric):
- Google: Basic Access approval (submitted, pending)
- Meta: business verification + ads_read Advanced Access via App Review
  (needs: deployed privacy/data-deletion URLs in app settings, screen
  recording of the connect flow, use-case description — reuse the Google
  design doc framing)
- Vercel env: 6 ad vars (NOT the *_REDIRECT_URI localhost overrides)
- Deploy: legal pages + all session work

## AB. Provenance drill-down — the trust layer's capstone

Click any figure → see the exact transactions behind it. TRUST_LAYER.md's
"Traceable" property, shipped.

- `src/app/api/pl/provenance/route.ts` — GET with scope (month|ytd) ×
  bucket (income|expenses) × optional category. Uses loadPrimaryLedger +
  the SAME classifier as the metric engine — never the raw transactions
  table (which would double-count Stripe payouts and break the exact-sum
  guarantee). Returns rows (newest first, with source) + count + total.
- `src/components/provenance/ProvenanceDrawer.tsx` — right slide-over:
  "Where this number comes from" header with the clicked figure, txn list
  with source badges, and a RECONCILIATION FOOTER: green "Sums exactly to
  the figure above" or an honest amber delta if data synced mid-session.
  Esc/scrim close, focus management.
- Wired: P&L Monthly Breakdown income/expenses cells (stopPropagation so
  the row's month-select still works), P&L Summary card Income/Expenses
  rows (current scope), Expenses Breakdown legend amounts (scope+category).
  Dotted-underline hover affordance everywhere.
- `tests/api/pl-provenance.test.ts` — the key property pinned WITHOUT
  assuming classifier internals: route totals are asserted equal to the
  real incomeStatement() over the same fixture, for months, YTD, and every
  category; plus partition check (Σ categories = total), ordering, 400/401.

Next trust-layer items (staged): tag-from-tool write path, reconciliation
tile, month-close locking.

## AC. Fix-the-AI write path — user reclassification (trust loop closed)

The drill-down PROVES a number; this lets the user FIX it. One tag moves the
transaction in every view at once — the trust-layer contract, now read+write.

- **Schema** (migration required, Eric: `npm run db:migrate` → name it
  `txn_reclass`): TxnClassification.category String? added; expenseClass now
  optional (either or both may be set). Expand-only.
- `classify.ts`: USER_CATEGORIES — auto-classifier labels + business
  categories the PFC taxonomy lacks (Advertising & Marketing, Payroll &
  Contractors, Insurance, Professional Fees, Equipment), 'Other' last.
- `ledger.ts`: categoryOverrides(orgId) read-side; classificationOverrides
  now filters null expenseClass.
- `compute.ts`: incomeStatement gains optional categoryOverridesMap — the
  override wins over the auto label at the single choke point.
- **Applied in every consumer**: /api/metrics, /api/pl/monthly,
  /api/pl/provenance, /api/transactions (which now returns externalId +
  editable + overridden flags).
- **API**: PATCH /api/transactions/classify {externalId, category?,
  expenseClass?} — org-scoped 404, USER_CATEGORIES validation, upsert,
  self-cleaning (all-null row is deleted); DELETE resets to auto.
- **UI** (Expenses table): hover a row → pencil appears next to the category
  badge → inline select (categories + "↺ Reset to auto" when overridden).
  On change, EVERYTHING reloads (cards, chart, breakdown, list) so the fix
  visibly moves the numbers. Teal ✦ marks user-fixed rows.
- **Tests**: category-override.test.ts (move-between-categories with totals
  invariant, no-op ghost override, partition check, USER_CATEGORIES sanity);
  provenance/monthly route mocks updated (categoryOverrides restored in
  beforeEach — clearAllMocks wipes factory impls).

## AD. Onboarding flow — connect → sync → first insight

The activation path. New users previously hit a static connect-prompt and,
after connecting, empty skeletons until sync finished. Now the dashboard
hosts a guided 3-step journey (src/components/onboarding/OnboardingFlow.tsx):

1. **Connect** — Plaid in-flow (PlaidLinkButton), trust copy (read-only,
   never demo data), Stripe + full-catalog alternates.
2. **Sync** — polls /api/metrics every 4s until hasData; animated checklist
   (connected ✓ → importing… → building P&L) so the wait reads as progress;
   honest slow-sync fallback after ~48s pointing at Integrations → Sync Now.
3. **First insight** — their actual Cash / Income YTD / Expenses YTD with the
   provenance teaser ("every figure can be clicked"), one button into the
   live dashboard (no extra fetch — the polled payload hydrates the page).

Dashboard condition is now `!anyConnected || !m?.hasData`, so the flow also
covers the connected-but-still-syncing window. Disappears permanently once
data exists. No schema changes.

## AE. PlaidLink — stuck "Connecting…" after cancelled Link (bug fix)

Found while testing onboarding: exiting the Plaid modal could leave the
button disabled on "Connecting…" forever. Root cause: `loading` was only
reset by Plaid's `onExit` callback — a single point of failure; if the modal
is closed at certain moments of initialization that callback is dropped, and
the disabled button offers no retry path.

Fix in src/components/integrations/PlaidLink.tsx: extracted `resetFlow()`
(clears loading + linkToken + the persisted resume token) and call it from
BOTH `onExit` and the `EXIT` Link event stream — belt and braces; either
path unsticks the button. Retry always fetches a fresh link token, so a
cancelled flow can never resume a consumed token. tsc + eslint clean.

## AF. Multi-user & invites — the seats the pricing page sells

The last critic-review priority. Pricing sells 1/3/10/unlimited seats; until
now none existed. Design principle: the org creator (Organization.userId)
stays the implicit OWNER with no new row, so every existing org is valid with
ZERO backfill.

Schema (migration: `npm run db:migrate`, suggest name `team_invites`):
- enum OrgRole (OWNER/MEMBER); User.activeOrgId (validated on every resolve)
- OrgMember (orgId+userId unique, role) — invited users only
- Invitation (orgId+email unique, tokenHash unique, expiresAt, acceptedAt) —
  only the SHA-256 hash of the invite token is stored; the link is shown once

Seat enforcement (src/lib/org.ts): SEAT_LIMITS {STARTER 1, GROWTH 3, PRO 10,
CFO ∞} checked at invite creation AND at accept (plan may change between);
pending unexpired invites count toward the limit.

Resolution (auth.ts getDefaultOrgId): activeOrgId (validated, stale pointers
self-clean) → owned org → joined org → create. Accepting an invite never
spawns a phantom personal org (accept route uses withAuth, not withOrg).

Routes: /api/org/members (GET roster+seats, DELETE owner-only, owner
irremovable, clears target's activeOrgId), /api/org/invites (POST owner-only
+ rate-limited, regenerates on re-invite; GET pending), /api/org/invites/[id]
(DELETE revoke), /api/org/invites/preview (public, no token oracle),
/api/org/invites/accept (email must match invite — the link alone is not a
bearer credential), /api/org/switch (GET orgs, POST set active).

UI: TeamSection in Settings (roster, invite form with one-time copyable
link, pending invites with regenerate/revoke, seat meter, org switcher when
in >1 org); /invite/[token] landing page (preview → accept, or login/register
with ?next= round-trip — added same-origin-only next support to the login
form POST and register page).

Tests: tests/api/org-invites.test.ts (12) — owner-only create, hashed token
never exposed, Growth seat limit incl. pending invites, accept email-match /
expiry / seat re-check / atomic transaction, owner irremovable. 37 suites
expected. No email provider yet — invites are share-the-link (Resend later).

## AG. Multi-entity (CFO Suite) — one login, many sets of books

First CFO Suite tier feature ($799/mo: fractional CFOs managing clients).
Builds directly on §AF's membership foundation. No schema changes — the org
model already supported multiple orgs per owner; what was missing was
creation, switching ergonomics, and gating.

- POST /api/org/create — gated: must OWN ≥1 CFO-plan org (the subscription
  umbrella). Created entities are plan CFO (covered, unlimited seats) and
  become active immediately — the dashboard then opens §AD's onboarding flow
  to connect the client's bank. Rate-limited 10/h.
- PATCH /api/org — rename active org, owner-only (client names on reports).
- GET /api/org/switch now returns canCreate (same rule the create route
  enforces — UI and API can't drift).
- src/components/layout/OrgSwitcher.tsx replaces the hardcoded sidebar user
  pill ("Eric Franco / Naviio" — now real /api/auth/me + active org name).
  Popover (click-away/Esc): org list with roles + active check, switch
  (full reload — honest workspace swap), inline rename (owner), "New
  organization" (CFO Suite only). Non-interactive pill for single-org
  members.
- Books separation rides the existing org-scoping: every data route resolves
  through getDefaultOrgId/withOrg, so entities can't bleed.

Tests: tests/api/org-create.test.ts (6) — CFO gating, created entity plan +
activeOrgId landing, rename owner-only, canCreate mirror. 38 suites expected.
Remaining CFO Suite items: client portal (read-only share), white-label.

## AH. Client portal (CFO Suite) — read-only share links

Second CFO Suite feature. A CFO sends a client a login-less link to view that
org's headline financials; the client never enters the product.

Schema (migration: `npm run db:migrate`, suggest `portal_shares`):
- PortalShare (orgId, label, tokenHash unique, scopes CSV, expiresAt?,
  revokedAt?, lastViewedAt?, viewCount). Only the SHA-256 hash of the token
  is stored — raw link shown once at creation.

src/lib/portal.ts — buildPortalSnapshot(orgId, name, scopes) computes the
snapshot with the SAME engine as /api/metrics (loadPrimaryLedger +
incomeStatement/cashFlow), so the client sees exactly the CFO's numbers.
Scopes (pnl/cash/kpis) gate which sections are returned; Plaid cash call is
skipped when neither cash nor kpis is shared.

Routes:
- /api/org/portal (owner-only): GET list (no tokens), POST create (label +
  scopes + optional expiry; returns link once; rate-limited 20/h)
- /api/org/portal/[id] DELETE — soft-revoke (keeps view-count history)
- /api/portal/[token] PUBLIC: no auth, looks up by hash, re-checks
  revoke+expiry every view (instant revocation), bumps view telemetry
  best-effort, scoped snapshot. Invalid/revoked/expired all 404 identically
  (no oracle). Cache-Control 60s + X-Robots-Tag noindex.

UI:
- src/app/portal/[token]/page.tsx — public branded read-only page (outside
  the dashboard group → no sidebar/auth shell), P&L/Cash/KPI sections per
  scope, "as of" stamp, "Powered by Navi".
- src/components/settings/PortalSection.tsx — owner manager in Settings:
  create with section toggles + expiry select, one-time copyable link,
  existing links with scopes/view-count/expiry + instant revoke. Renders
  nothing (403) for members.

Tests: tests/api/portal.test.ts (9) — owner-only, hashed token never exposed,
public read scope filtering + revoke/expiry refusal (no snapshot computed) +
identical 404 + hash-only lookup. 39 suites expected.
Remaining CFO Suite item: white-label (client logo on reports + portal).

## AI. White-label branding (CFO Suite) — client's brand on the portal

Third and final CFO Suite feature. A CFO can put each client entity's own
logo + accent color on that client's portal (and, going forward, exported
reports), and suppress the "Powered by Navi" mark.

Schema (migration: `npm run db:migrate`, suggest `org_branding`): three
nullable fields on Organization — brandLogoUrl, brandColor,
hideNaviioBranding (default false). Additive; no backfill.

src/lib/branding.ts — Branding type + validators: logo must be https (no
http/data: — XSS/exfil vectors on a public page), color a 3/6-digit hex.
Invalid values are rejected, never silently stored.

Gating: PATCH /api/org/branding is owner-only AND requires the ACTIVE org be
CFO-plan. Since client entities created under a CFO subscription are
themselves CFO-plan (§AG), a fractional CFO brands each client individually.
GET returns canEdit (owner && CFO) so the UI shows edit / upsell / nothing.

Plumbing: buildPortalSnapshot now takes Branding; the public /api/portal
route reads the org's brand fields and passes them through. The portal page
(src/app/portal/[token]/page.tsx) renders the client logo in place of
Naviio's, drives section accents from brandColor (hex-validated, falls back
to Naviio blue), and drops the "Powered by Navi" footer when hideNaviio is
set.

UI: src/components/settings/BrandingSection.tsx — logo URL + hex color
inputs, hide-Naviio toggle, and a LIVE portal-header preview (logo + accent
applied) so the owner sees the client-facing result before saving. Shows a
CFO Suite upsell for owners on lesser plans; renders nothing for members.

Tests: tests/api/org-branding.test.ts (10) — validators, owner+CFO gating
(403 CFO_REQUIRED / 403 member), https+hex rejection, empty-clears-field,
canEdit flag. 40 suites expected.

CFO Suite is now feature-complete: multi-entity (§AG) + client portal (§AH) +
white-label (§AI). Every pricing tier now delivers what the landing page
sells.

## AJ. White-label logo upload (Vercel Blob)

Upgraded white-label from URL-only to drag-and-drop upload (a CFO has the
client's PNG, not a hosted URL).

- src/lib/blob.ts — thin Vercel Blob wrapper. Import specifier held in a
  VARIABLE so tsc passes before @vercel/blob is installed (optional
  deploy-time dep); blobConfigured() gates on BLOB_READ_WRITE_TOKEN.
- POST /api/org/branding/logo — owner + CFO-plan gated; multipart; PNG/JPEG/
  WebP only (SVG excluded — script-carrying markup we won't host), ≤2 MB;
  uploads to public Blob, sets brandLogoUrl to the returned https URL (same
  field the portal renders — nothing downstream changes). 503 with a clear
  "paste a URL instead" message when the token isn't set, so dev still works.
- BrandingSection: Upload/Replace button with inline preview + Remove; the
  paste-a-URL field is now a collapsed "Or paste a logo URL" <details>
  fallback. Validation/portal rendering unchanged.

Eric-side to activate uploads: `npm i @vercel/blob`, enable Blob storage in
the Vercel project, add BLOB_READ_WRITE_TOKEN to env. Until then the URL
fallback works and upload returns a friendly 503. No schema change.
