# 0013 — Source-preference chains + graceful degradation with partial integrations

- **Date:** 2026-06-09
- **Status:** accepted (P&L slice implemented; other tabs to follow)
- **Owner (DRI):** naviio-orchestrator (integrations + ui)

## Context
Customers may connect only **one** integration, not the full set. Tabs must not
require a specific combination — each metric should source from whatever is
connected, preferring the canonical tool and falling back to alternatives.

## Decision
**Per-metric preference chains.** Each data domain tries sources in priority
order and reports which one it used (for an honest "Live · X" badge):

- Revenue / MRR / ARR → Stripe → Shopify → accounting income
- Cash & runway → Plaid → accounting bank summary
- **P&L (income/expenses/net) → QuickBooks/Xero → synthesized from the
  transaction ledger → demo**
- Expenses → accounting → Plaid debits → Gusto payroll
- Customers / churn → Stripe → GHL
- Payroll / headcount → Gusto → ADP

**P&L synthesis (implemented).** When no accounting tool is connected, derive a
best-effort YTD P&L from the persisted `Transaction` ledger (Stripe charges +
Plaid bank activity): credits = income, debits = expenses, net = the difference.
Labeled `synthesized` and flagged "Approximate" in the UI; gross profit and
invoices are omitted (not derivable without a ledger). Pure math in
`synthesizePL` is unit-tested; the DB rollup lives in
`synthesizePLFromTransactions`.

**Resolution order in `/api/pl`:** accounting → synthesized → demo, cached
(`org:<id>:pl`, MEDIUM TTL).

**Missing-data behavior:** prefer pulling the metric from *any* capable connected
source (e.g. cash flow can come from QBO/Xero, not just Plaid); only fall back to
demo + badge when nothing can supply it.

## Consequences
- A Stripe-only or Plaid-only customer now gets a populated, labeled P&L instead
  of demo data.
- Synthesized figures are explicitly approximate — never presented as
  ledger-accurate.

## Scope / next
- This decision establishes the pattern on `/pl`. Still to do: apply the same
  preference-chain + badge + fallback treatment to Revenue, Cash Flow, Expenses,
  KPIs/Overview, and the hexagon scoring, and add the accounting-derived cash and
  Plaid-derived expense extractors the chains above reference.

## Verification
- `synthesizePL` math: 3/3 assertions pass. `eslint` exit 0, `tsc` clean.
