# Naviio

Financial intelligence for SMBs and fractional CFOs. Naviio connects your bank
(Plaid), payments (Stripe), and accounting (QuickBooks / Xero) into live cash &
accrual P&L, cash flow, MRR, forecasting, a financial-model studio, and **Navi** —
an AI finance co-pilot. Built by Eric Franco.

## Features

- **Reporting** — cash-basis and accrual/GAAP P&L, cash flow, burn & runway, and
  a 12-month trend, computed by one shared metric engine so every view agrees.
- **Revenue** — MRR/ARR movement, churn, NRR, LTV, and cohort analysis from Stripe.
- **Expenses** — transactions auto-categorized by Navi, with one-click "fix the
  AI" reclassification and COGS / OpEx tagging that flows into the gross-margin P&L.
- **Financial model** — analysis, management reporting, cash-flow forecasting,
  consolidated reporting, and an AI commentary writer, with live-formula Excel and
  PDF export.
- **Navi co-pilot** — ask questions about your books in natural language.
- **Credits** — usage-based billing (metered Navi messages, on-demand refreshes,
  AI commentary) with a $10 reloadable pack via Stripe Checkout.
- **Multi-entity & sharing** — separate books per client entity, a read-only
  client portal, and white-label branding (CFO plan).
- **Security** — custom JWT sessions plus TOTP MFA, passkeys (WebAuthn), and SSO
  (Google / WorkOS); per-org access control and app-layer token encryption.

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- **Database**: PostgreSQL via Prisma 7 + `@prisma/adapter-pg` (Neon in production)
- **Auth**: Custom JWT (HTTP-only cookies) + bcrypt, TOTP MFA, WebAuthn passkeys, SSO
- **Charts**: Recharts (lazy-loaded via `next/dynamic`)
- **Integrations**: Plaid, Stripe, QuickBooks, Xero, plus Meta / Google Ads
- **Styling**: Tailwind CSS v4

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Fill in your secrets (see the table below)
```

### 2. Database

```bash
# Start Postgres (Docker)
docker run -d --name naviio-db \
  -e POSTGRES_DB=naviio \
  -e POSTGRES_USER=naviio \
  -e POSTGRES_PASSWORD=naviio \
  -p 5432:5432 postgres:16

export DATABASE_URL="postgresql://naviio:naviio@localhost:5432/naviio"

npx prisma migrate dev --name init
```

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

Until you connect a data source, the dashboards show empty states (there are no
mock financials). A development-only demo login is available for local exploration
and is disabled in production.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing session tokens |
| `TOKEN_ENCRYPTION_KEY` | Yes | AES-256-GCM key for at-rest OAuth-token encryption |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` | No | Plaid (banking) |
| `STRIPE_SECRET_KEY` | No | Stripe — revenue metrics **and** credit checkout |
| `STRIPE_WEBHOOK_SECRET` | No | Verifies Stripe webhooks (revenue + credits) |
| `QB_CLIENT_ID` / `QB_CLIENT_SECRET` / `QB_REDIRECT_URI` | No | QuickBooks OAuth |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | No | Xero OAuth |
| `ANTHROPIC_API_KEY` | No | Powers the Navi co-pilot and AI commentary |

When a provider's keys are absent, the related views show empty states rather than
fabricated numbers. See `.env.example` for the full list.

## Dashboard Views

| Route | Description |
|---|---|
| `/dashboard` | Overview — cash, MRR, ARR, runway, P&L snapshot, Navi score |
| `/pl` | Cash & accrual P&L with 12-month trend and figure-level provenance |
| `/cash-flow` | Cash position, burn rate, runway scenarios |
| `/revenue` | MRR/ARR movement, churn, NRR, LTV, cohort analysis |
| `/forecast` | Driver-based revenue & cash forecast with scenarios |
| `/model` | Financial-model studio (analysis, reporting, forecasting, commentary) + exports |
| `/expenses` | AI-categorized transactions, COGS / OpEx tagging, expense breakdown |
| `/kpis` | CAC, LTV, gross margin, EBITDA, magic number |
| `/cpa` | CPA / tax workspace |
| `/integrations` | Connect Plaid, Stripe, QuickBooks, Xero |
| `/settings` | Organization, Billing & Credits, Sharing, Security, Account |
| `/alerts` | Smart alerts for anomalies, milestones, churn risk |

## API Routes & Architecture

The full, current API surface (auth/MFA/passkeys/SSO, provider integrations,
webhooks, analytics, forecasting, credits, cron) plus system architecture,
database schema conventions, and the scaling plan live in
**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**. Design decisions are recorded
in **[docs/decisions/](./docs/decisions/)**.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, register, MFA challenge
│   ├── (dashboard)/     # Dashboard views (overview, pl, cash-flow, …)
│   └── api/             # REST API routes
├── components/
│   ├── layout/          # Sidebar, Header, OrgSwitcher
│   ├── ui/              # MetricCard, Card, Badge, …
│   ├── charts/          # Lazy-loaded recharts components + ChartSkeleton
│   ├── model/           # Financial-model tabs and chart
│   ├── settings/        # Team, Portal, Branding, Credits sections
│   └── provenance/      # Figure → transactions drill-down drawer
├── lib/
│   ├── api/             # withAuth / withOrg / withOwner route wrappers
│   ├── metrics/         # Ledger classifier + income-statement / cash-flow engine
│   ├── integrations/    # Plaid, Stripe, QuickBooks, Xero
│   ├── model/           # Gross-margin model, projection, Excel export
│   ├── credits/         # Credit account, rates, Stripe Checkout
│   ├── forecasting/     # MRR/cohort forecast engine
│   ├── auth.ts          # JWT auth + session cookies
│   ├── org.ts           # Roles, seats, plan helpers
│   └── prisma.ts        # Prisma client (pg adapter)
└── types/               # Shared TypeScript types
```

## Connecting Integrations

- **Plaid (banking)** — add `PLAID_CLIENT_ID` / `PLAID_SECRET`, then connect from
  `/integrations` (opens Plaid Link).
- **Stripe (revenue + credits)** — add `STRIPE_SECRET_KEY`; revenue metrics pull
  automatically, and credit reloads use Stripe Checkout.
- **QuickBooks / Xero (accounting)** — add the OAuth client credentials and
  connect from `/integrations` to enable accrual/GAAP reporting.

---

*Built by Eric Franco — FP&A professional and former CFO.*
