# 0015 — Dashboard tabs wired to the live engine; demo financials removed

- **Date:** 2026-06-10
- **Status:** accepted (5 core tabs done; KPIs/Revenue-charts/Forecast/CPA remain)
- **Owner (DRI):** naviio-orchestrator (metrics + ui)

## Context
Goal: every metric card backed by real data, and **zero demo financials** in prod.
Decision 0014 built the engine + `/api/metrics`; this entry covers wiring the UI
and ripping out mock data, plus the QBO/Xero transaction sync.

## What shipped
- **QBO/Xero → ledger transaction sync** (`accounting-txn-map.ts`,
  `syncXeroTransactions`, `syncQuickBooksTransactions`): pull their raw
  *transactions* (Xero BankTransactions; QBO Purchase/Deposit/SalesReceipt) into
  the ledger. Triggered on connect, on Sync Now, and nightly cron.
  `primaryLedger()` enforces the hierarchy: **Plaid/Stripe win; accounting only as
  fallback** — never double-counted. Mappers unit-tested (6 assertions).
- **Endpoints**: `/api/metrics` (income statement + cash flow + cash + runway,
  with `hasData`/`sources`), `/api/transactions` (classified rows). `/api/pl` now
  engine-backed too.
- **Tabs fully live + demo-free** (with `ConnectPrompt` empty states):
  - **Overview** — adaptive cards (only what's connected), cash-flow chart, YTD
    P&L snapshot, runway gauge.
  - **P&L** — YTD income/expenses/net/margin, income-vs-expenses chart, expenses
    by category, monthly breakdown table. Old mock cards/OpEx-waterfall/
    prior-year comparison removed; `LivePLBand` + `PLComparison` deleted.
  - **Cash Flow** — cash balance, burn, net flow, runway, trend chart, real
    outflow categories, scenario model.
  - **Expenses** — categorized breakdown, filter, real transaction table.
  - **Alerts** — real DB alerts, no mock fallback, fake rules toggles removed.

## Accuracy fixes folded in (from the audit)
- Plaid cash balance = **depository accounts only** (no credit-card inflation).
- Alerts PATCH is **org-scoped** (IDOR fixed); `all` bulk-read added.
- P&L no longer double-counts Stripe payouts; transfers/loan principal excluded.

## Consequences
- A customer connecting Plaid/Stripe (or only Xero/QBO) gets a populated, honest
  dashboard with no demo numbers on these tabs.

## Remaining
- Still mock: **KPIs, Revenue charts, Forecast (mock-anchored), CPA/Tax.**
- "Missing capture" build (green-lit): MRR snapshots → NRR/waterfall/cohorts; CAC
  from ad-spend; AirCheck scoring engine; a tax estimator for CPA.
- Cleanup: `/api/pl` + `pl-synthesis.ts` are now largely superseded by `/api/metrics`.
