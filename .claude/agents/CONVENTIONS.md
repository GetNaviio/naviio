# Naviio — Shared Conventions

> Every Naviio subagent must read this file first. It captures conventions that
> are already true in this repo. Match them; don't invent new patterns.

## What Naviio is
A financial-intelligence platform for businesses. It connects accounting,
banking, payments, payroll, e-commerce and CRM sources, normalizes them into a
single financial picture, and scores a business's health across six metrics
(revenue growth, profit margin, cash flow, debt ratio, expense control, DSO)
visualized as a hexagon radar. Built for web and mobile. Advisors/CPAs monitor
client orgs.

## Stack (ground truth — verify against package.json, don't assume)
- Next.js 16 (App Router) + React 19 + TypeScript — src/app
- Tailwind CSS v4 + shadcn-style primitives in src/components/ui
- Framer Motion for animation, Recharts for standard charts
- Prisma 7 + PostgreSQL (@prisma/adapter-pg) — prisma/schema.prisma
- Auth: custom JWT in src/lib/auth.ts (cookie markup_session, bcrypt,
  jsonwebtoken), TOTP MFA via otplib/qrcode in src/lib/mfa.ts. next-auth is
  installed but the live path is the custom JWT layer — confirm before touching.
- Redis via ioredis (src/lib/cache.ts)
- AWS S3 + Secrets Manager (src/lib/storage.ts)
- Integrations: Plaid, Stripe, QuickBooks (intuit-oauth), Xero (xero-node),
  Gusto, ADP, Shopify, GoHighLevel
- Tests: Jest + Testing Library (jest.config.js), Playwright e2e
- CI: .github/workflows/ci.yml, deploy deploy.yml

## Next.js version warning (from AGENTS.md — non-negotiable)
This is NOT the Next.js in your training data. APIs, conventions, and file
structure may differ. Before writing any Next.js code, read the relevant guide
under node_modules/next/dist/docs/ (e.g. 01-app/...). Heed deprecation notices.

## Import & path conventions
- Use the @/ alias for everything under src (@/lib/..., @/components/...,
  @/types). Never use long relative ../../.. chains.
- Prisma client singleton: import { prisma } from '@/lib/prisma'
- Prisma types: import type { Integration } from '@prisma/client'

## API route pattern (src/app/api/.../route.ts)
- Export named handlers (GET, POST, ...). Use the Web Response:
  return Response.json(data) / Response.json({ error }, { status }).
- Gate every protected route with: await requireAuth() from '@/lib/auth'.
- Error convention already in the codebase:
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
- OAuth providers live under src/app/api/auth/<provider>/ with callback/route.ts.
  Stripe webhook: src/app/api/auth/stripe/webhook/route.ts.

## Data model (Prisma) — the spine
- Everything financial is scoped by orgId (an Organization, owned by a User). A
  user can own multiple orgs; advisors view client orgs.
- Integration is unique on [orgId, provider] (IntegrationProvider enum: PLAID,
  QUICKBOOKS, STRIPE, XERO, GUSTO, ADP, SHOPIFY, GOHIGHLEVEL). Status enum:
  CONNECTED | ERROR | DISCONNECTED. Tokens on the row (accessToken/refreshToken
  @db.Text), plus realmId, itemId, expiresAt, lastSyncedAt.
- Transaction is unique on externalId; indexed by [orgId, date] and
  [orgId, category]. Report (Json data), Alert (severity enum), Category (tree).
- ALWAYS filter by orgId. Never return another org's data. Treat orgId as a
  tenancy boundary.

## Integration layer (src/lib/integrations/)
- Each provider exports fetch<Provider>Data(orgId) returning a provider-shaped
  object (or null on failure).
- index.ts exposes fetchAllData(orgId): Promise<NormalizedFinancials>. It
  discovers CONNECTED integrations, fans out with Promise.allSettled so one
  failing provider never blocks the rest, then maps into NormalizedFinancials
  (revenue/expenses/cash/customers/sources/raw/syncedAt).
- Token access goes through getTokenForUser(orgId, provider) / refreshToken.ts
  (refreshes 5 min before expiry). Don't read integration.accessToken directly
  when a refresh helper exists.
- New providers: add to the enum, write src/lib/integrations/<p>.ts, wire into
  index.ts, extend NormalizedFinancials only if it adds a new field.

## Security (see docs/security/)
- Handles bank, payment, and payroll data. Treat all of it as sensitive. Never
  log tokens, access tokens, account numbers, or full transaction payloads.
  Redact in errors.
- Secrets come from env / AWS Secrets Manager — never hardcode. JWT_SECRET,
  PLAID_*, STRIPE_*, QB_*, XERO_* live in .env (see .env.example).
- Verify webhook signatures (Stripe webhooks.constructEvent). Never trust
  webhook bodies unverified.
- Enforce auth + orgId scoping on every data path. No IDOR.

## Quality gates (run before declaring done)
- npm run lint        ESLint (flat config + eslint-config-next)
- npm test            Jest (npm run test:ci for coverage)
- npx tsc --noEmit    type-check
- npm run build       must compile

## Style
- 2-space indent, single quotes, no semicolons (match existing files).
- Small pure functions; money math explicit and commented.
- Section dividers use the // ─── Section ─── style seen across the codebase.

## Operating model (canonical — applies to every task)
Naviio runs on the **AI-native operating model** in `.claude/agents/OPERATING-MODEL.md`
(adopted from "YC on how to build a company with AI"). Read it. The non-negotiables:

- **AI as the OS** — route work through the agent system, don't do it ad hoc.
- **Closed loops** — define target → act → measure (gates: lint, tsc, test, build)
  → feed back. Nothing ships on an open loop.
- **Queryable** — every significant action produces an artifact (`docs/decisions/`,
  the content log, CI). If it isn't written down, it didn't happen.
- **Software factory** — spec + failing tests first, then implement to green.
- **No middleware** — orchestrator routes directly to the owning specialist.
- **Record a decision** in `docs/decisions/` for anything architectural.
