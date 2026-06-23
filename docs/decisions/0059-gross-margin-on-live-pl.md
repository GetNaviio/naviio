# 0059 — Gross margin on the live P&L (multi-industry foundation)

## Context
Naviio is expanding from startup-only to **any industry**. A controller review
found the single most important P&L line — **gross profit / gross margin** — was
computed by an existing engine (`lib/model/cogs.ts`, `lib/model/incomeStatement.ts`)
but **not wired into the live P&L**: `lib/metrics/compute.ts incomeStatement()`
emitted only total income / total expenses / net. The KPIs page even listed Gross
Margin as "locked." Gross margin is the keystone universal metric (it separates an
80%-margin SaaS from a 25%-margin restaurant), and it's the prerequisite for
industry-specific unit economics.

## Decision (Phase 1 of the multi-industry plan)
1. **Fold COGS / gross profit into the live income statement.** `incomeStatement()`
   now also returns `cogs`, `grossProfit`, `grossMargin`, `operatingExpenses`,
   `operatingIncome`. Additive and non-breaking: `netIncome = totalIncome −
   totalExpenses` is unchanged; `operatingExpenses = totalExpenses − cogs`.
2. **Cross-industry COGS heuristic.** Broadened `cogs.ts` beyond the SaaS-shaped
   set (cloud infra, payment fees) to also catch restaurant food/beverage
   suppliers (Sysco, US Foods, Restaurant Depot, produce), trades materials &
   subs (Home Depot, Lowe's, lumber, subcontractor), and agency freelancers/1099.
   User COGS/OpEx tags still win over the heuristic (`expenseClassOverrides`).
3. **Surfaced it:** the `/api/pl` synthesized P&L now fills `grossProfit` (was
   hard-null); `/api/metrics` threads the user COGS tags so the YTD statement and
   KPIs agree; the P&L page shows Revenue → Cost of Revenue → Gross Profit →
   Operating Expenses → Net Income (only when a COGS split exists); the KPIs page
   unlocks a **Gross Margin** card (shown only when `cogs > 0`, so a business with
   no identifiable cost of revenue doesn't see a misleading 100%).

## Why
- Gross margin is universal — every business has it, and it's the basis for each
  industry's unit economics (e-comm contribution margin, restaurant prime cost,
  etc.) in the planned industry-metric library (Phase 2).
- Reuses the already-built, already-tested COGS classifier rather than a parallel
  path, so the live P&L and the financial-model page can't drift.

## Tests
`tests/lib/accounting-engine.test.ts`: gross-profit split (COGS via heuristic →
gross profit/margin, operating income == net income on cash basis) and a user
COGS→OpEx override dropping COGS to 0.

## Next (Phase 2, not in this change)
Standardize `USER_CATEGORIES` into statement groups (Revenue/COGS/S&M/Payroll/G&A),
a business-type onboarding signal, an industry-aware metric registry, and de-SaaS
the Navi score with per-industry benchmarks.
