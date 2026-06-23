# Navi intelligence backlog — Fractional-CFO industry playbook

Source: industry survey of fractional-CFO practice areas (metrics, benchmarks,
and the financial problems each vertical hires a CFO to solve). This is a
**build-from backlog**: it maps each industry's real CFO metrics to Naviio's
metric registry (`src/lib/metrics/registry.ts`), notes what we compute today vs.
what's locked behind a missing data source, and captures the benchmark numbers we
can turn into per-industry Navi-score bands.

How to use it: when adding a metric, find its row below → it already states the
formula, the data input it needs, and the benchmark band to score it against.

---

## Coverage matrix (industry → status)

| Industry | Business type | Pack built? | Notable gap |
|---|---|---|---|
| Technology / SaaS | `saas` | ✅ (MRR/NRR/churn/LTV-CAC, Revenue tab) | fundraising/cap-table tooling |
| Construction | `trades` | ✅ job margin, materials %, labor & subs % | % -of-completion / WIP / retention |
| Real estate / property | `realestate` | ✅ NOI margin, opex ratio | occupancy, cap rate, cost/door |
| Professional services / agency | `agency` | ✅ labor ratio, service GM, rev/client | utilization, realization, partner comp |
| Healthcare | `healthcare` | ✅ provider cost, overhead | collections rate, days in A/R, payer mix |
| Manufacturing / distribution | `manufacturing` | ✅ production GM, materials %, overhead | inventory turns, capacity, std-cost variance |
| Retail / e-commerce | `ecommerce` | ✅ contribution margin, refund rate, mktg % | AOV, sell-through, open-to-buy, omni-channel |
| Hospitality / food service | `restaurant` | ✅ prime cost, food %, labor % | covers, avg check, occupancy cost |
| Nonprofit | `nonprofit` | ✅ personnel ratio, overhead ratio | program-expense ratio, fundraising efficiency |

**Biggest single gap: Nonprofit** is not a business type yet (fund accounting,
grant compliance, donor diversification). Add `nonprofit` to the industry enum +
inference + a pack (see below).

---

## Per-industry intelligence

Legend: **[live]** computable from bank+Stripe today · **[locked]** needs a data
source we don't capture yet (shown as "connect X to unlock").

### Technology / SaaS — `saas`
CFO focus: subscription revenue modeling, burn management, fundraising, cap table.
- **[live]** MRR / ARR, gross MRR churn, NRR, LTV/CAC, Magic Number, runway.
- **Backlog:** revenue-recognition policies (we now do ratable recognition — 0057),
  investor-pitch financials export, scenario/round modeling, rule-of-40, burn
  multiple (KPIs currently lists these "locked").
- Metric priority weighting (from the source): MRR growth 95%, LTV 92%, CAC 90%,
  churn 88%, burn 85% — use to weight the SaaS score dimensions.

### Construction — `trades`
CFO focus: project-based accounting, job costing, retention, bonding capacity.
- **[live]** job gross margin, materials %, labor & subs %.
- **[locked]** percentage-of-completion revenue, work-in-progress schedule,
  retention receivable/payable, change-order tracking, bonding ratios.
  *Unlock:* job-costing feed (Foundation / Viewpoint / Procore / Jobber).

### Real estate / property — `realestate`
CFO focus: project/property accounting, financing structure, volatile costs.
- **[live]** NOI margin, operating-expense ratio.
- **[locked]** occupancy, cap rate, cost per door, DSCR, draw schedules.
  *Unlock:* property management (AppFolio / Buildium / Yardi) + property values.

### Professional services / agency — `agency`
CFO focus: utilization, realization, project profitability, partner comp.
- **[live]** labor cost ratio, service gross margin, revenue per client.
- **[locked]** **Utilization rate** (billable ÷ available hours), **realization
  rate** (collected ÷ standard rate), revenue per employee, A/R days, project-
  level margin, partner-compensation modeling. *Unlock:* time-tracking
  (Harvest / Toggl) + headcount + A/R aging.

### Healthcare — `healthcare`
CFO focus: revenue-cycle management, payer mix, regulatory compliance.
- **[live]** provider & staff cost ratio, overhead ratio.
- **[locked]** **Days in A/R** (benchmark 30–40, target 25–30), **collections /
  net collection rate** (benchmark 95–98%, target >97%), operating margin
  (benchmark 15–20%), provider productivity, payer mix. *Unlock:* practice-
  management / billing feed (athenahealth / DrChrono) + A/R aging.

### Manufacturing / distribution — `manufacturing`
CFO focus: cost accounting, margin analysis, inventory & working capital.
- **[live]** production gross margin, materials % of revenue, overhead ratio.
- **[locked]** inventory turnover, days inventory, std-cost variances, capacity
  utilization, make-vs-buy modeling, capex ROI. *Unlock:* inventory/ERP feed
  (NetSuite / Fishbowl) for inventory balances.

### Retail / e-commerce — `ecommerce`
CFO focus: inventory turnover, promo effectiveness, omni-channel, CAC.
- **[live]** contribution margin, refund rate, marketing % of revenue.
- **[locked]** AOV, sell-through rate, inventory turns, open-to-buy budget,
  per-channel P&L, markdown rate. *Unlock:* store/marketplace feed
  (Shopify / Amazon) for orders + inventory.

### Hospitality / food service — `restaurant`
CFO focus: labor & food cost control, menu engineering, seasonality.
- **[live]** **prime cost** (food+labor ÷ sales, target ≤ 60%), **food cost**
  (benchmark 28–32%), **labor cost** (benchmark 30–35%).
- **Benchmark cost structure (score bands):** F&B 28–32%, labor 30–35%,
  occupancy 8–12%, opex 12–15%, profit 8–12% of revenue.
- **[locked]** covers, average check, occupancy-cost %, menu-item margin mix.
  *Unlock:* POS (Toast / Square) for covers + check data.

### Nonprofit — `nonprofit` (TO BUILD)
CFO focus: fund accounting, grant compliance, donor diversification, reserves.
- **[live, once added]** program-expense ratio (program ÷ total expense),
  admin/overhead ratio, fundraising-efficiency (cost to raise a dollar),
  months of operating reserve (= our runway, relabeled).
- **[locked]** restricted vs. unrestricted fund balances, grant burn vs. budget,
  donor concentration. *Unlock:* fund-accounting feed (QuickBooks classes /
  Sage Intacct) + grant register.
- Inference signals: `grant`, `donor`, `donation`, `501c3`, `foundation`,
  `pledge`, `endowment`, `Blackbaud`, `DonorPerfect`.

---

## Cross-cutting backlog (applies to all industries)

1. **Per-industry Navi-score benchmark bands.** Today the score bands are generic.
   Use the benchmarks above (restaurant prime cost ≤60%, healthcare A/R 25–30d &
   collections >97% & op-margin 15–20%, SaaS metric weights) to make
   `scoring.ts` grade each industry on its own curve.
2. **Connectors that light up the [locked] metrics** — the highest-leverage data
   work, in rough demand order: time-tracking (agency), POS (restaurant/retail),
   store/marketplace (e-comm), practice-management (healthcare), job-costing
   (construction), property-management (real estate), inventory/ERP (mfg),
   fund-accounting (nonprofit). Each is a `requires[]` input the registry already
   gates on, so adding one feed auto-unlocks its metrics with no rework.
3. **Business-stage playbook** (startup → growth → scaling → mature → exit): Navi
   could tailor recommendations + deliverables to the org's stage, not just its
   industry. Deliverables per stage: pitch financials, cash-flow forecasting, KPI
   dashboards, profitability analysis, quality-of-earnings/clean-financials.
4. **Fundraising / financing intelligence** (SaaS + all): pitch-deck financials,
   loan-package prep, "what lenders/investors look for," financing-type guidance
   (bank / SBA / LOC / equity). A Navi "raise readiness" report.
5. **Engagement context for the firm product:** typical fractional-CFO clients are
   $1M–$50M revenue, paying $3k–$15k/mo for ~10–20 hrs — useful for Naviio's
   firm-tier pricing/positioning and for sizing which orgs to target.

---

## Immediate next actions (smallest → largest)
- [x] Add `nonprofit` business type (enum + inference + pack) — shipped: personnel
      ratio + overhead ratio [live]; program-expense ratio + cost-to-raise-$1
      [locked, need functional-expense tagging / donor system).
- [ ] Per-industry score benchmark bands in `scoring.ts` (data is in this doc).
- [ ] First connector to unlock locked metrics — recommend **time-tracking** or
      **POS** (highest fractional-CFO demand, cleanest data).
