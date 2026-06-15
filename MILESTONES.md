# Naviio — Milestone Tracker

Shared coordination board for all 8 agents working on this project.
**Single source of truth.** Read this before starting work; update it when status changes.

> Last reviewed: 2026-06-10 — production-readiness pass complete; see docs/CHANGELOG-2026-06-10.md, docs/CODE_REVIEW.md, docs/BUG_HUNT.md

---

## How agents use this file

1. **Claim work** — put your agent ID in the `Owner` column before starting (`A1`–`A8`). One owner per milestone.
2. **Update status** as you go: `⬜ Todo` → `🟡 In progress` → `✅ Done` (use `🔴 Blocked` if stuck, and note why).
3. **Edit in place** — change only your own rows when possible to avoid merge conflicts. Keep the date in `Updated`.
4. **Add new milestones** under the right workstream rather than creating side docs.
5. **Definition of done** = code merged, tests passing, no TypeScript errors.

Status legend: `⬜ Todo` · `🟡 In progress` · `✅ Done` · `🔴 Blocked`

---

## Workstream 1 — Integrations

| Milestone | Owner | Status | Updated | Notes |
|---|---|---|---|---|
| Plaid (bank) connect + transactions | — | ✅ | 2026-06-10 | routes present under `api/plaid` & `api/auth/plaid` |
| QuickBooks OAuth + sync | — | ✅ | 2026-06-10 | `api/auth/quickbooks`, `api/quickbooks` |
| Stripe metrics + webhook | — | ✅ | 2026-06-10 | `api/stripe`, `api/auth/stripe/webhook` |
| Xero OAuth | — | ✅ | 2026-06-10 | `api/auth/xero` |
| Shopify OAuth | — | ✅ | 2026-06-10 | `api/auth/shopify` |
| Gusto / ADP payroll | — | ✅ | 2026-06-10 | `api/auth/gusto`, `api/auth/adp` |
| GoHighLevel (GHL) | — | ✅ | 2026-06-10 | `api/auth/ghl` |
| Disconnect + sync orchestration | — | ✅ | 2026-06-10 | `api/integrations/sync`, `disconnect` |

## Workstream 2 — Dashboard & Analytics

| Milestone | Owner | Status | Updated | Notes |
|---|---|---|---|---|
| Main dashboard | — | ✅ | 2026-06-10 | `(dashboard)/dashboard` |
| Cash flow | — | ✅ | 2026-06-10 | `(dashboard)/cash-flow` |
| Revenue | — | ✅ | 2026-06-10 | `(dashboard)/revenue` |
| Expenses | — | ✅ | 2026-06-10 | `(dashboard)/expenses` |
| P&L | — | ✅ | 2026-06-10 | `(dashboard)/pl` |
| KPIs | — | ✅ | 2026-06-10 | `(dashboard)/kpis` |

## Workstream 3 — Forecasting & Insights

| Milestone | Owner | Status | Updated | Notes |
|---|---|---|---|---|
| Forecast engine | — | ✅ | 2026-06-10 | `lib/forecasting`, `api/forecast` |
| Scenario modeling | — | ✅ | 2026-06-10 | `api/forecast/scenarios` |
| AI insights chat | — | ✅ | 2026-06-10 | `api/insights/chat` |
| Alerts & rules | — | ✅ | 2026-06-10 | `(dashboard)/alerts`, `api/alerts` |
| CPA / tax optimization | — | ⬜ | — | `(dashboard)/cpa` |

## Workstream 4 — Auth, Security & Platform

| Milestone | Owner | Status | Updated | Notes |
|---|---|---|---|---|
| Login / register / session | — | ✅ | 2026-06-10 | `api/auth/*`, `lib/auth` |
| MFA (setup/verify/disable) | — | ✅ | 2026-06-10 | `api/auth/mfa`, `lib/mfa` |
| Settings page | — | ✅ | 2026-06-10 | `(dashboard)/settings` |
| Security docs / policies | — | ✅ | 2026-06-10 | `docs/security` |
| S3 report storage | — | ⬜ | — | `lib/storage` |

## Workstream 5 — Quality & Release

| Milestone | Owner | Status | Updated | Notes |
|---|---|---|---|---|
| Test coverage (Jest) | — | ✅ | 2026-06-10 | 26 suites: mappers/metrics/forecasting + new auth-token, credits-atomicity, webhook, refund, orchestrator, OAuth-callback coverage |
| Lint / TS clean build | — | ✅ | 2026-06-10 | eslint + `tsc` |
| Marketing landing page | — | ✅ | 2026-06-10 | `app/page.tsx` |
| Production deploy | — | ⬜ | — | `infrastructure/` |

---

## Agent roster

| ID | Agent / focus | Current milestone |
|---|---|---|
| A1 | — | — |
| A2 | — | — |
| A3 | — | — |
| A4 | — | — |
| A5 | — | — |
| A6 | — | — |
| A7 | — | — |
| A8 | — | — |
