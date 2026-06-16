# 0046 — Mobile hero on the financial pages (P&L, Cash Flow, Revenue, Expenses)

- **Date:** 2026-06-16
- **Status:** accepted
- **Owner (DRI):** product

## Decision
Extended the dashboard's "one hero + chips" mobile pattern (decision 0045) to the
core financial pages via a shared `MobileHero` component. On a phone each page now
leads with its single most-important number and three supporting chips; the desktop
metric-card grids are unchanged (`hidden lg:grid`). Applied to P&L, Cash Flow,
Revenue, Expenses, plus KPIs, Forecast, and the Model's analysis tab.

## Per-page hero
- **P&L** — hero **Net Income** (YoY trend arrow); sub = income + margin; chips:
  Income · Expenses · Margin.
- **Cash Flow** — hero **Cash Balance** (MoM balance trend arrow); sub = runway +
  burn; chips: Burn · Net (mo) · Runway.
- **Revenue** — hero **MRR** (MoM trend from the movement waterfall); sub = ARR +
  NRR; chips: ARR · Customers · Churn.
- **Expenses** — hero **Total Expenses** (no arrow — rising cost shouldn't read
  "green"); sub = largest category + category count; chips: top 3 categories by spend.

## Why
Consistency: every page reads the same on mobile, so the eye always lands on the
number that matters first, then a few supporting figures, then charts/tables one
scroll down. `MobileHero` keeps the markup in one place.

## Trust
Trend arrows are only shown where a real period-over-period value exists (P&L YoY,
cash MoM, MRR from the waterfall). Chips show values without arrows rather than
fabricating trends. Expenses deliberately omits an arrow to avoid green-for-bad.

## Verification
- `tsc` + `eslint` clean. Desktop grids unchanged (`hidden lg:grid`); UI-only, no
  test impact.
