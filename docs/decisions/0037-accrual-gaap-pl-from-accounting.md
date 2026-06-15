# 0037 — Accrual / GAAP P&L pulled from the connected accounting system

- **Date:** 2026-06-10
- **Status:** accepted
- **Owner (DRI):** product + security-legal-specialist

## Decision
Surface a real **accrual / GAAP-basis** P&L in-app, sourced directly from the
customer's connected accounting system (QuickBooks or Xero), shown **alongside**
Naviio's cash-basis figures on the P&L page. Previously the cash-basis disclaimer
just deflected ("for accrual/GAAP figures, use your accounting system"); now those
figures appear next to the cash numbers when an accounting integration is connected.

The two views are kept distinct and honestly labeled:
- **Cash basis** — computed by Naviio's own metric engine from the raw Plaid/Stripe
  transaction ledger (deduped; never inherits an accounting tool's errors).
- **Accrual basis** — taken verbatim from the customer's books, labeled "as recorded
  in your accounting system." Accuracy depends on their bookkeeping; Naviio does not
  re-derive or independently verify it.

## Changes
- **`lib/integrations/quickbooks.ts`** — `fetchProfitAndLoss(orgId, method?)` and
  `fetchQuickBooksData(orgId, method?)` accept an accounting basis; the accrual path
  passes `accounting_method=Accrual` on the `/reports/ProfitAndLoss` call. (Xero's
  `/Reports/ProfitAndLoss` is accrual by default, so no change there.)
- **`app/api/pl/route.ts`** — in addition to the cash-basis `summary`, the route now
  fetches an `accrual` summary whenever QuickBooks/Xero is CONNECTED (QBO on Accrual,
  Xero default) via the existing `summarizeAccounting` parser, and returns it in the
  payload `{ summary, source, accrual }`. Cached with the payload.
- **`app/(dashboard)/pl/page.tsx`** — fetches `/api/pl` for `accrual`; renders an
  **"Accrual basis · QuickBooks/Xero"** card (Total Income, Gross Profit, Total
  Expenses, Net Income, plus outstanding A/R) beside the cash-basis summary. The
  bottom disclaimer adapts: points to the accrual card when present, otherwise
  prompts to connect QuickBooks/Xero.

## Why this shape
- The accounting parsers (`accounting-map.ts`) are basis-agnostic, so the same code
  produces the accrual summary from the accrual report — no new parsing logic.
- Cash basis stays Naviio-computed (our source of truth); accrual stays vendor-sourced.
  Mixing the two would muddy provenance and overclaim accuracy we don't control.

## Honesty mandate
The accrual card is explicitly "GAAP-basis, as recorded in your accounting system,"
with a tooltip noting accuracy depends on the customer's bookkeeping. It is never
presented as Naviio's independently-computed figure.

## Verification
- `eslint` clean; `tsc --noEmit` exit 0.
- Existing `accounting-map` parser tests unaffected (parsing logic unchanged).
- Requires a QuickBooks or Xero connection to display (cash-basis behavior unchanged
  for Plaid/Stripe-only orgs).

## Follow-ups
- Optional: a monthly accrual trend (the report fetch is YTD totals today).
- Optional: balance-sheet items (A/P, deferred revenue) for a fuller GAAP view.
