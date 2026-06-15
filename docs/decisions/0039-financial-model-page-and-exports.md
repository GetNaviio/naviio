# 0039 — Financial Model page with live-formula Excel + PDF export

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** product

## Decision
Add a **Financial Model** page (`/model`, in the dashboard nav) that shows the
current gross-margin P&L and an **editable forward projection**, with two exports:
a live-formula **Excel** workbook (so users execute/tweak the model in Excel) and a
**PDF** via the browser's print-to-PDF.

## Changes
- **`lib/model/project.ts`** — pure driver-based monthly projection: revenue
  compounds at a growth rate, gross profit = revenue × margin, opex compounds at its
  own rate, operating income = gross profit − opex. Unit-tested
  (`tests/lib/model-project.test.ts`); mirrors the Excel formulas exactly.
- **`/api/model`** — returns the current YTD gross-margin income statement
  (`modelIncomeStatement` over the Plaid/Stripe ledger) plus monthly run-rate
  defaults that seed the projection. COGS uses the heuristic split (manual tagging
  is a separate feature).
- **`lib/model/export.ts` + `/api/model/export`** — builds a `.xlsx` with **exceljs**:
  a blue assumptions block and a projection whose cells are Excel **formulas**
  referencing the assumptions, so changing inputs in Excel recalculates the model.
- **`/model` page** — current P&L card, editable assumption inputs (horizon, start
  revenue, growth %, gross margin %, start OpEx, OpEx growth %), a recharts
  revenue/operating-income chart, the monthly projection table with totals, and
  Export-to-Excel / Save-as-PDF buttons. A `@media print` block isolates the report
  area for a clean PDF.
- **Nav** — `Sidebar.tsx` gains a "Financial Model" item.
- **Dependency** — `exceljs ^4.4.0` added to `package.json` (sandbox can't reach npm;
  **requires `npm install` on the dev machine**).

## Why a separate projection vs the existing forecast engine
The existing `lib/forecasting/engine.ts` is MRR/cohort-driven (SaaS). The model page
needs a simple, transparent gross-margin P&L projection that maps 1:1 to the Excel
formulas users will run — so a dedicated, fully-tested `projectModel` is clearer than
overloading the forecast engine.

## Verification
- `eslint` clean across all new files; `tsc --noEmit` clean except the expected
  "Cannot find module 'exceljs'" until `npm install` runs.
- `projectModel` verified at runtime (compounding, gross-profit reconstruction, totals,
  zero-horizon).

## Required / follow-ups
- `npm install` (for exceljs) + dev-server restart to use the page/export.
- Follow-up: feed manual COGS tags (TxnClassification) into `/api/model`; add scenario
  presets (bear/base/bull) and a balance-sheet/cash view.
