# MarkUp AI

Real-Time Financial Intelligence for SMBs & Startups — built by Eric Franco.

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL via Prisma 7 + `@prisma/adapter-pg`
- **Auth**: Custom JWT (HTTP-only cookies) + bcrypt
- **Charts**: Recharts
- **Integrations**: Plaid, Stripe, QuickBooks, Xero, Gusto, ADP, Shopify
- **Styling**: Tailwind CSS v4

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
# Fill in your secrets (see below)
```

### 2. Database

```bash
# Start Postgres (Docker)
docker run -d --name markupai-db \
  -e POSTGRES_DB=markupai \
  -e POSTGRES_USER=markupai \
  -e POSTGRES_PASSWORD=markupai \
  -p 5432:5432 postgres:16

# Set your DATABASE_URL
export DATABASE_URL="postgresql://markupai:markupai@localhost:5432/markupai"

# Run migrations
npx prisma migrate dev --name init
```

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

**Demo mode**: The app runs fully with realistic mock data — no real API keys needed. Click "Sign in" on the login page with the pre-filled demo credentials to explore all 8 dashboard views.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing session tokens |
| `PLAID_CLIENT_ID` | No | Plaid dashboard client ID |
| `PLAID_SECRET` | No | Plaid sandbox/production secret |
| `PLAID_ENV` | No | `sandbox` \| `development` \| `production` |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (`sk_test_...`) |
| `QB_CLIENT_ID` | No | QuickBooks app client ID |
| `QB_CLIENT_SECRET` | No | QuickBooks app client secret |

When API keys are absent, all endpoints fall back to demo data automatically.

## Dashboard Views

| Route | Description |
|---|---|
| `/dashboard` | Overview — cash, MRR, ARR, runway, P&L snapshot |
| `/pl` | Real-time P&L statement with 12-month trend |
| `/cash-flow` | Cash position, burn rate, runway scenarios |
| `/revenue` | MRR, ARR, churn, LTV, cohort analysis |
| `/expenses` | AI-categorized transactions, expense breakdown |
| `/kpis` | CAC, LTV, gross margin, EBITDA, magic number |
| `/integrations` | Connect Plaid, QuickBooks, Stripe, Xero, Gusto |
| `/alerts` | Smart alerts for anomalies, milestones, churn risk |

## API Routes & Architecture

The full, current API surface (~60 routes: auth/MFA/passkeys, 8 provider
integrations, webhooks, analytics, forecasting, credits, cron) plus system
architecture, database schema conventions, and the scaling plan live in
**[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login + Register pages
│   ├── (dashboard)/     # All 8 dashboard views
│   └── api/             # REST API routes
├── components/
│   ├── layout/          # Sidebar, Header
│   ├── ui/              # MetricCard, Card, Badge
│   ├── charts/          # PLChart, CashFlowChart, RevenueChart, etc.
│   ├── integrations/    # IntegrationCard
│   └── alerts/          # AlertFeed
├── lib/
│   ├── auth.ts          # JWT auth + session cookies
│   ├── plaid.ts         # Plaid SDK wrapper
│   ├── stripe.ts        # Stripe SDK wrapper
│   ├── quickbooks.ts    # QuickBooks OAuth
│   ├── mock-data.ts     # Realistic demo financial data
│   └── prisma.ts        # Prisma client (pg adapter)
└── types/               # Shared TypeScript types
```

## Connecting Real Integrations

### Plaid (Banking)
Add `PLAID_CLIENT_ID` and `PLAID_SECRET` to `.env`. Go to `/integrations` and click "Connect" on the Plaid card — it opens the Plaid Link modal.

### Stripe (Revenue)
Add `STRIPE_SECRET_KEY`. The `/api/stripe/metrics` endpoint automatically pulls live MRR, ARR, and subscription data.

### QuickBooks
Add `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, and `QB_REDIRECT_URI`. Click "Connect" on the QuickBooks card to trigger the OAuth flow.

---

*Built by Eric Franco — FP&A professional and former CFO. May 2026.*
