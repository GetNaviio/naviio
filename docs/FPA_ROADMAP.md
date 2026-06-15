# Naviio — FP&A Product Roadmap (5-year horizon)

> 2026-06-10. Written from an SVP-of-FP&A seat: what the planning suite has
> today, and the staged path to a tool a 500-person company's finance team
> would still run on. Sequenced by when customers actually hit the need —
> build on demand signal, not speculation.

## Shipped (v1 + v2, this session)

| Capability | Notes |
|---|---|
| Workforce planning | Roles × headcount × loaded cost, start/end months, **departments with subtotals**, 12-month cost/headcount series |
| Budget vs Actuals | 3-line × 12-month grid, **prev/current/next-year planning**, **seed-from-run-rate**, monthly B/A/V grid + YTD variance, favorable/unfavorable coloring |
| TTM / rolling forecast | Months-on-columns P&L grid, TTM-actuals anchor, workforce-delta-aware OpEx, **GM% / OI% margin rows**, 12-mo totals |
| Scenarios | Bear/base/bull + persisted custom scenarios (multipliers) |
| Plumbing | All org-scoped, Decimal money, zod-validated, classifier-consistent actuals (`/api/model/monthly`) |

## Stage 1 — when first paying customers ask (months 0-6)

1. **Budget at category granularity** — REVENUE/COGS/OPEX → budget by ledger
   category (the `Category` table exists; `BudgetLine` gains a nullable
   `categoryId`). This is the #1 request every finance user will make.
2. **Edit-in-place for workforce roles** (PATCH endpoint; UI inline edit) and
   merit/raise assumption (annual % applied at a review month).
3. ~~Excel export for all three models~~ — **SHIPPED** (one-workbook export +
   Budget/Workforce .xlsx import with round-trip templates; works for Excel
   and Google Sheets). Native add-ins (Office.js AppSource / Apps Script
   Marketplace) remain Stage 2+: separate codebases, OAuth, store review —
   the import/export endpoints shipped today are the API they would call.
4. **Budget copy-forward** — "copy 2026 budget → 2027 with +X%".

## Stage 2 — when teams arrive (months 6-18)

5. **Driver-based revenue planning** — replace flat growth % with drivers the
   data already supports: new logos × ARPU, NRR from MrrSnapshots, pipeline ×
   close-rate from GHL. The MRR waterfall is already computed; wire it in.
5b. **Payroll-provider sync into Workforce Planning (Gusto / ADP / Deel)** —
   pull the actual roster into the Workforce tab so plan-vs-actual headcount
   closes the loop. Design (agreed 2026-06-11):
   - Schema (additive): `WorkforceRole` gains `source` ('plan' | 'gusto' |
     'adp' | 'deel', default 'plan') and `sourceExternalId` (provider employee
     id, unique per org+source) — synced rows upsert idempotently and never
     collide with manual plan rows; the TTM delta math needs no change.
   - Gusto + ADP: OAuth already shipped; needs deeper scopes/API calls for
     per-employee compensation (current fetches return totals/roster only).
   - Deel: new provider — one `REFRESH_CONFIG` row + one OAuth callback config
     + one mapper, per the established integration pattern.
   - Sync runs through the orchestrator (`SYNC_DISPATCH` row each), so locks,
     cooldowns, and the cron sweep apply automatically.
   - UI: synced rows render with a provider badge, read-only except loadedPct;
     "actual vs plan" headcount variance card.
   - Privacy note: per-employee compensation is sensitive — synced salary data
     inherits the existing at-rest posture and must never appear in exports
     unless the user explicitly includes it (export gains an "exclude synced
     compensation" toggle when this ships).
6. **Scenario-linked budgets & forecasts** — bear/base/bull variants of the
   budget; TTM tab toggles scenario (engine + multipliers already exist).
7. **Approval & lock** — lock a budget version at board approval; variances
   reported against the locked version, re-forecasts tracked separately
   (`BudgetLine` gains `version`; one-line migration).
8. **Cash-flow bridge** — P&L forecast → cash forecast (DSO/DPO assumptions,
   payroll timing from workforce plan).

## Stage 3 — mid-market credibility (years 2-3)

9. **Cost centers / GL mapping** — map provider categories → customer chart of
   accounts; department P&L (workforce departments already seed the dimension).
10. **Multi-entity consolidation** — the Organization model supports many orgs
    per user; consolidation = currency translation + eliminations layer.
11. **Rolling forecast automation** — auto re-anchor monthly, track
    forecast-vs-actual accuracy over time (the credibility metric for FP&A).
12. **Board pack generator** — one click: TTM grid + B/A/V + commentary
    (Navi already writes commentary) → PDF/PPTX (skills exist server-side).

## Stage 4 — platform (years 3-5)

13. Deeper HRIS coverage beyond payroll (ATS pipeline → planned-hire
    auto-creation), building on the Stage 2 payroll sync.
14. What-if sandboxing (fork a scenario, drag assumptions, diff against base).
15. ML-assisted seasonality + anomaly-aware forecast seeding.

## Design principles that keep this buildable

Pure domain math in `src/lib/model/*` (every artifact is a function of ledger +
plan rows — testable, exportable, API-stable); months are 'YYYY-MM' strings
everywhere; money is Decimal at rest, number at the boundary; every table is
org-scoped with cascade delete; additive migrations only.
