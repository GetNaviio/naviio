# 0061 — Industry metric packs (Phase 3)

## Context
Phase 2 added business-type detection + a universal Navi score. Phase 3 adds the
metrics that actually run each business a fractional CFO serves, on top of the
universal core. Built the metric-registry architecture the controller review
recommended, with honest graceful degradation: a metric that applies to the
business but can't be computed from current data is listed as "connect X to
unlock," never shown as a fake or $0 value.

## Decision
1. **Metric registry** (`lib/metrics/registry.ts`) — each metric declares the
   industries it applies to and a pure `compute(ctx)` that returns `null` when its
   inputs aren't available. `selectMetrics(industry, ctx)` returns `visible`
   (computable now) and `locked` (applies but needs more data).
2. **Packs (computable from bank + Stripe data today):**
   - **E-commerce / DTC:** Contribution Margin ((gross profit − ad spend) ÷ rev),
     Refund Rate, Marketing % of Revenue. *Locked:* AOV (needs store/order feed).
   - **Restaurant / Hospitality:** Prime Cost ((food + labor) ÷ sales), Food Cost,
     Labor Cost. *Locked:* Average Check (needs POS covers).
   - **Professional services / Agency:** Labor Cost Ratio, Service Gross Margin,
     Revenue per Client (when a customer count exists). *Locked:* Utilization
     (needs time-tracking).
   - **Trades / Construction:** Job Gross Margin, Materials %, Labor & Subs %.
     *Locked:* Backlog (needs job-costing).
   - Food cost / materials map to the same cost-of-revenue ÷ revenue ratio — each
     industry just reads it in its own language. All derive from the Phase-1 COGS
     split and the standardized expense categories (Payroll & Contractors,
     Advertising & Marketing).
3. **UI** (`IndustryMetrics`, on the KPIs page) renders the visible cards plus an
   "Unlock with more data" list with the specific connector to add. Renders
   nothing for a generic/unset business type.

## Why
- Reuses the live P&L (gross margin, COGS, category breakdown) + Stripe metrics —
  no new data dependency for the computable metrics, so they work on day one.
- Graceful degradation is structural (`compute → null` ⇒ locked), so adding a
  data source later (POS, time-tracking) lights up the locked metrics with no
  rework.

## Tests
`tests/lib/registry.test.ts` — per-industry formulas (prime cost, contribution
margin, labor ratio, job margin, rev/client) and lock behavior (AOV, utilization,
backlog, rev/client when customers unknown). Verified via ts-node (12/12).

## Next
Order/POS/time-tracking connectors to unlock the locked metrics; per-industry
score benchmark bands; standardize `USER_CATEGORIES` into a fixed chart of
accounts (would let food vs. materials vs. subs be split precisely rather than
read from the single COGS total).
