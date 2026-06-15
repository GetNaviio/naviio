# 0011 — QuickBooks/Xero accounting data wired onto the P&L dashboard

- **Date:** 2026-06-08
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (data-db + ui slices)

## Context
QBO and Xero were connect-only: tokens stored, data fetched into `raw`, but never
surfaced. The provider P&L reports don't map cleanly onto the rich illustrative
P&L statement on `/pl`, so a full replacement would be brittle.

## Decision
- **Pure parsers** (`accounting-map.ts`): walk the QBO and Xero report row trees
  and distil a small normalized `AccountingSummary` — YTD income, expenses, net
  income, gross profit, currency, and outstanding-invoice count/amount. Xero
  labels vary by org, so its parser matches on patterns, not exact strings.
  Unit-tested (`accounting-map.test.ts`, 10 assertions) against captured fixtures.
- **Aggregator**: added an `accounting` block to `NormalizedFinancials`, populated
  via `summarizeAccounting(qbo, xero)` (QuickBooks preferred when both connected).
- **API**: `GET /api/pl` returns the summary + source, org-scoped and cached
  (`org:<id>:pl`, MEDIUM TTL); `source: 'demo'` when neither is connected. The
  disconnect route's `delPattern('org:<id>:*')` already busts this key.
- **UI**: a client `LivePLBand` fetches `/api/pl` and renders a YTD band (4 metric
  cards + gross-profit line) with a "Live · QuickBooks/Xero" badge. It renders
  **nothing** when not connected, so the existing demo P&L is untouched.

## Consequences
- Connecting QuickBooks or Xero now shows real YTD numbers on `/pl` immediately.
- The detailed monthly statement/table stays illustrative for now — a later pass
  can drive those line items from provider data if desired.

## Loop / verification
- Parser logic: 10/10 assertions pass (run standalone in-sandbox; full Jest suite
  runs on the Mac where the SWC binary is available).
- `eslint` exit 0, `tsc` clean. Manual: connect QBO/Xero sandbox → `/pl` shows the
  live band; disconnect → band disappears on next load.
