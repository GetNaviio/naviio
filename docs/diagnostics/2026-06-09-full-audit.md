# Full Diagnostic — 2026-06-09 (overnight audit)

Four read-only audit agents swept integrations/tenancy, auth/security, API/data
correctness, and frontend/runtime. Project-wide **`tsc` and `eslint` are clean**.
Findings below are deduped and prioritized.

## ✅ Patched tonight (safe, additive — review before deploy)
These were unauthenticated routes exploitable on the live site, so I closed them:
- `src/app/api/insights/chat/route.ts` — was **open to the public** and streams Claude
  with a system prompt that **hard-codes real financials** ($1.956M revenue, tax
  liability, etc.). Anyone could read your numbers and burn the Anthropic key.
  Added `requireAuth()`.
- `src/app/api/forecast/route.ts` and `src/app/api/forecast/scenarios/route.ts`
  (GET/POST/DELETE) — unauthenticated, with state-mutating POST/DELETE. Added
  `requireAuth()`.

**These fixes are local only — production stays exposed until you `vercel --prod`.**
Recommend deploying first thing.

---

## 🔴 Critical (production-live)

1. **Middleware auth gate is dead code** — `src/proxy.ts:4,27`. `PUBLIC_PATHS`
   includes `'/'` and the check is `pathname.startsWith(p)`, so **every** path
   matches and the `if (!token) redirect('/login')` block never runs. Page-level
   redirect protection is fully bypassed. Data APIs still call `requireAuth()`, so
   it's not an immediate data breach, but the front-line gate is off.
   Fix carefully (must keep `/`, `/login`, `/register`, `/privacy`, `/terms`,
   `/contact`, `/integrations/oauth`, `/api/waitlist` public): use exact match for
   `/` and proper prefix matching for the rest.

2. **JWT_SECRET fallback** — `src/lib/auth.ts:7` defaults to
   `'dev-secret-change-in-production'`. Not set in local `.env`, so **local** runs
   on a public secret (anyone could forge a session). Production **does** have a
   strong `JWT_SECRET` (set in Vercel), so prod is OK — but remove the fallback and
   throw on startup if unset.

3. **Secrets hygiene** — `.env` holds live Neon password, Anthropic key, Stripe
   keys, Plaid/QBO/Xero secrets. `.gitignore` covers `.env*` and there's no git
   repo yet (nothing committed), but: delete the stray `.env.save` backup, and
   **rotate** these before launch since they've been handled in plaintext.

4. **P&L synthesis double-counts** — `src/lib/integrations/pl-synthesis.ts`. Units
   are consistent (both major), but summing **all** CREDITs as income counts a
   Stripe charge AND its Plaid bank deposit (double revenue), and **all** DEBITs as
   expenses includes transfers/card payments/owner draws (overstated expenses).
   Fix: pick a single non-overlapping source and exclude transfer categories.

5. **Stripe metrics treats the platform env key as org connectivity** —
   `src/app/api/stripe/metrics/route.ts:15`. If `STRIPE_SECRET_KEY` is set but the
   org hasn't connected Stripe, it serves **the platform's own** Stripe data as the
   customer's "live" data. Gate live mode on the per-org Integration row only.

---

## 🟠 High

- **Alerts PATCH is IDOR** — `src/app/api/alerts/route.ts:26` updates by `id` with
  no `orgId` scope; any authed user can mark any org's alert read. Use
  `updateMany({ where: { id, orgId } })`.
- **CORS `*` + credentials** — `next.config.ts:11-14`. Invalid/dangerous combo.
  Reflect a trusted-origin allowlist instead of `*`.
- **`/api/pl` cache not busted on connect/sync** — only disconnect busts
  `org:<id>:*`. After connecting QBO/Xero (or after a cron/webhook sync) the page
  can serve up to 15 min of stale synthesized/demo data, and a stale `source`
  label. Bust `org:<id>:pl` (+ `:dashboard`) on connect callbacks and after sync.
- **Integrations connect→status race** — `integrations/page.tsx`. `fetchStatus`
  **replaces** state from the DB; if the just-connected row isn't reflected yet,
  the card flips Connected → back to Connect. Merge instead of replace
  (`setIntegrations(prev => ({ ...prev, ...next }))`).
- **Plaid cash balance double-counts credit cards** — `plaid.ts:245` sums
  `current` across all account types incl. credit (positive owed balance).
  Filter to `type === 'depository'`.
- **Unguarded margin math will NaN/Infinity when live** — `dashboard/page.tsx:110`
  (NRR uses `ltv/arpu` no guard), `pl/page.tsx:86,96,123,124` (inline
  `cogs/revenue` etc.). Route through `calcMarginPct`/`calcLtv` (already imported).

---

## 🟡 Medium

- **OAuth `state` isn't anti-CSRF** — callbacks trust `userId` decoded from an
  unsigned base64 `state` (stripe/qbo/xero/shopify). Generate random state, store
  in session, verify on callback; derive userId from the session, not state.
- **Shopify `shop` param = SSRF** — `shopify/route.ts` interpolates `shop` into
  outbound URLs with no `*.myshopify.com` validation. Validate before use.
- **Stripe pagination caps** — `getRevenueByMonth`/`fetchRevenue`/`getChurnRate`
  use `limit:100` with no auto-paging → undercounts busy accounts. Use
  `autoPagingEach`. Also `months*31`-day windows mis-bucket; use calendar months.
- **Timezone year-start mismatch** — synthesis uses local `new Date(y,0,1)`; QBO/
  Xero use string dates in the org locale. Compute YTD in UTC consistently.
- **Forecast NaN params** — `forecast/route.ts` `parseFloat(...)` unguarded; add
  `Number.isFinite` checks.
- **Stripe webhook busts all orgs' caches** — `stripe.ts:394`
  `delPattern('org:*:stripe:metrics')` on every platform event. Scope to the org.
- **Theme FOUC** — dark flash before `localStorage` theme applies; add a blocking
  inline script in `<head>`.
- **Session cookie not Secure in one writer** — `auth.ts` `setSessionCookie`
  (`secure:false`) vs `makeSessionCookieHeader` (Secure). Standardize on Secure.

---

## 🟢 Low / cleanup
OAuth tokens stored plaintext (encrypt at rest for prod) · `DEMO_USER` bypass
should be env-gated/disabled in prod · Shopify HMAC not timing-safe · sidebar
Alerts badge hardcoded `3` · Header refresh/bell/search buttons non-functional ·
toast/`setTimeout` not cleared on unmount · `IntegrationCard._StatusIcon` dead
code + `pending` status unreachable · Phase-2 Connect buttons hit not-configured
OAuth · `fetch*Data(userId)` params actually receive orgId (rename for clarity) ·
forecast `customScenarios` is in-memory module state (lost on cold start, not
tenant-scoped).

---

## Tabs not yet live-wired (graceful-degradation roadmap — decision 0013)
Only **Revenue** (Stripe), the **P&L live band** (`/api/pl`), **Insights**,
**Integrations**, and **Settings** consume live data today. Still pure mock:
**Overview/Dashboard** (route hard-codes `source:'demo'`), **Cash Flow**,
**Expenses**, **KPIs** (hardcoded string literals), **CPA/Tax**, **Forecast**
(ignores `orgId`), **Alerts**, and the **hexagon scoring**. These need the
preference-chain + source-badge + fallback treatment, plus accounting-derived
cash and Plaid-derived expense extractors.

---

## Suggested order for tomorrow
1. **Deploy tonight's auth fixes** (`vercel --prod`) — closes the live data/key leak.
2. Fix `proxy.ts` middleware (Critical #1) with the full public-paths list.
3. Remove `JWT_SECRET` fallback + delete `.env.save` + plan secret rotation.
4. Fix P&L synthesis double-count (#4) and Stripe-metrics tenancy (#5).
5. Org-scope alerts PATCH, lock CORS, bust `/api/pl` cache on connect/sync.
6. Then resume the degradation roadmap (Cash Flow next, per decision 0013).
