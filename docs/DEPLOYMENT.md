# Naviio — Production Deployment & Operations

> 2026-06-10. Companion to [deploy/go-live-runbook.md](./deploy/go-live-runbook.md)
> (step-by-step cutover) and [ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Deployment architecture — the decision

**Primary: Vercel.** The project is already linked (`.vercel/`), the pipeline
exists (`deploy.yml`), crons are declared (`vercel.json`), and a one-person
team should not operate container infrastructure. Vercel gives atomic
immutable deploys, instant rollback, edge TLS/CDN, and zero server patching.

**Escape hatch: AWS ECS Fargate** (`Dockerfile`, `deploy/aws/*.tf` Terraform).
Kept current as the exit path if Vercel pricing/limits bite (long-running
syncs, websocket needs). Do NOT run both.

**Kubernetes: explicitly rejected.** At this team size and traffic, K8s adds
an operational tax (upgrades, node pools, ingress, RBAC) with zero benefit
over Vercel/Fargate. Revisit only with a platform team and multi-service
sprawl — likely never.

```
GitHub (main) ──► GitHub Actions
                   ├─ CI (every PR): lint · tsc · 227 tests (Postgres service)
                   │                 · prisma migrate deploy (validates migrations)
                   │                 · next build
                   └─ Deploy (push to main):
                        npm ci → prisma generate
                        → prisma migrate deploy  (prod DB — expand-only rule)
                        → vercel build → vercel deploy --prebuilt --prod
                        → DEEP HEALTH GATE (/api/health?deep=1, 5 retries)
                        → Slack ✅ / ❌

Vercel (app.naviio.com)
  ├─ Next.js serverless functions (~60 API routes + pages)
  ├─ Vercel Cron → /api/cron/sync (06:00 UTC) · /api/cron/purge (04:00 UTC)
  └─ Log drain → Axiom/Logtail  (structured JSON via src/lib/log.ts)

Neon Postgres (primary state) · Upstash/Redis (cache, rate limits, locks,
session revocation) · S3 (reports) · Stripe/Plaid webhooks → signature-verified
routes
```

## 2. Deployment workflow & rollback

1. PR → CI must pass (branch protection on `main` — enable it in GitHub).
2. Merge to `main` → deploy pipeline runs. Migrations run **before** the new
   code serves traffic; therefore all migrations must be **expand-only**
   (add columns/tables/indexes; never drop or rename in the same release as
   the code change — drop in release N+1).
3. **Post-deploy gate** (added this pass): the pipeline curls
   `/api/health?deep=1` on the new deployment — app + database reachability —
   5 attempts, then fails the run and alerts Slack. A deploy that can't reach
   Postgres is a failed deploy, not a green checkmark.
4. **Rollback**: Vercel dashboard → Deployments → previous build → "Promote to
   Production" (instant, atomic — this is the main reason Vercel wins here).
   DB rollbacks don't exist in practice; the expand-only rule means old code
   always runs against the new schema.

## 3. Monitoring & logging strategy

**Already wired (this pass):**
- `src/lib/log.ts` — zero-dep structured JSON logger. Ops-critical events are
  now machine-queryable: `credits_unresolved_purchase`,
  `credits_persist_failed`, `credits_refund_failed`, `sync_failed`,
  `sync_sweep_complete`.
- `/api/health` (shallow, for LBs) and `/api/health?deep=1` (DB round-trip,
  for monitors/deploy gates).
- Slack notifications on every deploy outcome.

**To configure (15 minutes each, no code changes):**
1. **Uptime**: UptimeRobot or Checkly free tier → GET
   `https://app.naviio.com/api/health?deep=1` every 1-5 min → alert on 503/timeout.
2. **Log drain**: Vercel → Project → Settings → Log Drains → Axiom (free tier
   is generous). Then build two alerts: any `credits_*` error event (money —
   page immediately) and `sync_failed` rate > N/hour (degraded provider).
3. **Error tracking**: `npm install @sentry/nextjs && npx @sentry/wizard@latest -i nextjs`
   — the one new dependency worth taking before launch; captures unhandled
   route errors with stack traces + user context. Route through `log.ts`'s
   seam later if desired.
4. **DB**: Neon dashboard → enable autoscaling alerts (compute, storage,
   connection count). Watch connection count — serverless functions + Prisma
   can exhaust pools; if it climbs, switch DATABASE_URL to Neon's pooled
   (pgbouncer) connection string.

**Alert philosophy:** page on money events and deep-health failures; ticket on
sync failure rates; ignore single transient errors — every external provider
flakes.

## 4. Reliability & downtime risk reduction (current posture)

| Risk | Mitigation in place |
|---|---|
| Bad deploy | CI gates (227 tests + migrations) → deep-health gate → instant Vercel rollback |
| DB outage | Shallow LB health check won't kill app instances; deep monitor pages you; rate-limit/cache/locks fail open (degrade, don't lock out) |
| Redis outage | Every Redis consumer (cache, rate limit, revocation, sync locks) has in-memory fallback and fails open by design |
| Provider API outage | Per-provider `Promise.allSettled` isolation; sync failures logged + skipped, never cascade; idempotent re-sync catches up |
| Webhook loss | Cron sweep is the backstop (stalest-first); webhook replays safe (idempotent upserts, unique stripeRef) |
| Migration mistake | Validated against real Postgres on every PR; expand-only rule; Neon point-in-time restore as last resort |
| Secret leak | Boot validation, no secrets client-side, rotation list in changelog §F |
| Thundering herd | Per-org+provider locks + 60s cooldown; bounded sweep concurrency (5) |

## 5. Scaling knobs (in order, pull when metrics say so)

1. `REDIS_URL` (Upstash) — required at >1 instance for correct rate
   limits/locks/revocation. **Do this at launch.**
2. Neon pooled connection string when connection count alerts.
3. Cron frequency: hourly → */15 as data-freshness expectations rise
   (`vercel.json`; needs Vercel Pro for sub-daily).
4. SQL aggregation for metrics (CODE_REVIEW item 9) when P95 on /api/metrics
   crosses ~1s.
5. Queue-based sync via the `enqueueSync` seam (item 12) when cron sweeps
   approach the 60s function limit.
6. Read replicas / Transaction partitioning (ARCHITECTURE §6) at ~1M txns/org.

## 6. Production deployment checklist (condensed; full cutover in go-live-runbook.md)

**GitHub** — push repo · add secrets (VERCEL_TOKEN/ORG_ID/PROJECT_ID,
DATABASE_URL, SLACK_WEBHOOK_URL) · enable branch protection requiring CI.

**Vercel env (Production scope)** — DATABASE_URL (prod Neon) · JWT_SECRET ·
TOKEN_ENCRYPTION_KEY (stable forever) · CRON_SECRET · ADMIN_EMAILS ·
REDIS_URL · NEXT_PUBLIC_BASE_URL · Plaid prod keys · Stripe live keys (+
webhook secrets) · ANTHROPIC_API_KEY. All freshly rotated — dev values are
burned.

**Webhooks** — Stripe dashboard → endpoint `https://app.naviio.com/api/auth/stripe/webhook`
(+ credits endpoint), copy signing secrets · Plaid dashboard → webhook URL.

**Monitors** — uptime check on `?deep=1` · log drain + the two money/sync
alerts · Sentry wizard.

**Verify after first deploy** — pipeline green incl. health gate · login +
Touch ID passkey · logout-then-back-button (revocation) · connect a sandbox
Plaid item · `vercel logs` shows JSON events · cron hits at 06:00 UTC
(`sync_sweep_complete` in logs).

**Tidy** — `rm .env.save` · `npm audit` triage · confirm `dev.log` not deployed
(gitignore it if not already).
