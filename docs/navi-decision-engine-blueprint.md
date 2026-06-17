# Navi Decision Engine — Blueprint

*The capability the deck promises ("recommendations, not reports" / "AI Decision Engine V2") turned into a buildable design. This is the moat: not a chatbot bolted onto a dashboard, but a CFO-grade decision copilot whose every answer is computed from the customer's real financial data and logged as proprietary data that compounds.*

Status: design / north-star. Owner: product + AI. Companion to the pitch deck's slides 04 (The Shift), 07 (Product), and the three hero scenarios (lease, med-spa, boardroom).

---

## 0. Thesis — why this is the moat

A dashboard answers *"what happened?"* A report answers *"what's the number?"* Navi answers **"what should I do, and can I afford it?"** — the question a $300k/yr CFO answers, in seconds, grounded in *this* business's books.

Three reasons it's defensible (ties to the moat analysis):

1. **It runs on proprietary, compounding data.** Every decision a customer asks Navi — the question, the assumptions, the verdict, and (later) what they actually did — becomes a *decision log*. No competitor who didn't host the decision has it. Over time these logs train better recommendations and feed benchmarks ("med-spas that bought this class of equipment broke even in ~7 months").
2. **It's only trustworthy if it's grounded.** Generic LLMs can talk about finance; they can't see *your* cash, burn, vendors, and margins. Navi sits on the unified ledger (Plaid + Stripe + accounting) — the answer is computed, not guessed. That grounding is the product.
3. **It deepens switching costs.** The more a founder asks Navi to reason over their numbers, sets their thresholds and assumptions, and shares Navi's board narratives, the more their decision context lives in Naviio.

**Design principle that makes all of this real: _compute, don't hallucinate._** The LLM orchestrates and explains; a deterministic financial engine does every calculation. (Section 2.)

---

## 1. What it is — one capability, three shapes

**Navi Decision Engine** = a natural-language interface where the user asks a forward-looking financial question and gets a structured, grounded answer with a verdict, the math, the assumptions, the risks, and next steps.

The three hero scenarios from the deck map to three **Decision Templates**:

| # | Deck scenario | Decision template | Core question |
|---|---|---|---|
| A | Retail lease (street) | **Affordability / Commitment** | "Can I take on this recurring or one-time cost without breaking cash?" |
| B | LUXE Med Spa laser | **Investment / Capex ROI** | "Is this purchase/financing a good deal — payback, break-even, runway impact?" |
| C | NorthStar boardroom | **Strategic / Board narrative** | "Given our trajectory, what should we do about runway, hiring, profitability?" |

All three share one **answer contract** (Section 4) and one **engine** (Section 2). New templates (hiring a role, raising prices, taking a loan, making payroll, extending a runway) are just new parameterizations of the same machine.

---

## 2. Core architecture — "compute, don't hallucinate"

The single most important decision: **the LLM never does arithmetic on the customer's money.** It plans, calls deterministic tools, and narrates the results. This is what separates Navi from "ChatGPT with a finance prompt," and it's the only way to keep the honesty promise (no fabricated numbers).

```
User question (NL)
   │
   ▼
[1] Intent + slot extraction (LLM)         → template + parameters (amount, term, APR, horizon…)
   │
   ▼
[2] Context retrieval (RAG over org data)  → cash, burn, runway, MRR, margins, vendor history, prior decisions
   │
   ▼
[3] Tool calls (DETERMINISTIC engine)      → the math: forecast, breakeven, payback, scenarios
   │
   ▼
[4] Answer composition (LLM)               → verdict + explanation, strictly from tool outputs
   │
   ▼
[5] Render (decision card)  +  Log (decision record)  +  Meter (credits)
```

### The tool layer (the part that must be deterministic)
These are pure functions over the existing metric/forecast engine. The LLM may only state numbers that came out of these tools.

- `getFinancialContext(orgId)` → cash balance, monthly burn, runway, MRR/ARR, YTD P&L, gross margin, top vendors/categories, connected sources, data freshness.
- `forecastCashFlow(orgId, { deltas[], horizonMonths })` → projected monthly cash balance with one-time and recurring deltas applied (extends the current bear/base/bull forecast). Returns the series + min balance + breach flag vs. the user's **minimum-cash threshold**.
- `affordabilityCheck(orgId, { amount, recurring?, startDate, horizon, minCashFloor })` → can-afford boolean, projected balance, headroom, the month (if any) cash dips below floor. *(Template A.)*
- `capexAnalysis(orgId, { price, financing{apr,term,downpayment}, unitEconomics{avgRevenuePerUnit, grossMarginPct, unitsPerMonth} })` → break-even units, payback months, monthly payment, ROI, runway impact, Section 179 tax note flag. *(Template B.)*
- `breakevenAnalysis(orgId, { fixedAdd, contributionMargin })` → units/revenue to cover the new cost.
- `scenarioCompare(orgId, scenarios[])` → side-by-side outcomes (e.g., 10 / 15 / 20 treatments per month).
- `runwayPath(orgId, { hires[], growthAssumption, spendPlan })` → projected runway, profitability month, ending cash, cash buffer. *(Template C.)*
- `benchmark(orgId, metric, peerFilter)` → percentile vs. comparable companies (sector/stage/size) — the data-network layer; ships once there's enough N.

Each tool returns **values + the formula + the inputs used**, so the UI can "show the math" and the answer can cite provenance.

### Grounding & retrieval
- Structured context (the numbers) comes from the engine, not a vector store — it must be exact and current.
- Unstructured retrieval (a vendor's history, prior decisions, notes, uploaded docs) uses embeddings.
- Every answer carries a **freshness stamp** ("based on data synced 2h ago") and the **sources** used.

---

## 3. The three Decision Templates (detailed)

### Template A — Affordability / Commitment  *(the lease)*
**Triggers:** "can we afford…", "can I sign…", "do we have room for…", "what happens to cash if we add $X/mo".
**Inputs:** amount (one-time and/or recurring), start date, horizon (default 3/6/12 mo), **minimum-cash floor** (user-set; default e.g. a % of monthly burn or an explicit number like $500K from the deck).
**Computes:** `affordabilityCheck` → projected cash curve with the commitment applied; lowest point; whether/when it breaches the floor.
**Answer (matches deck card):** Verdict ("Based on your cash flow forecast, **yes** — within 3 months"), a 3-month impact table (Total investment, Cash-position impact, Projected balance), the cash curve, and the guardrail line ("keeps you above your minimum cash threshold of $500K"). If it breaches: "**Not yet** — this dips you to $X in month 2, below your $500K floor. You could afford it if [defer 6 weeks / reduce by $Y / etc.]."

### Template B — Investment / Capex ROI  *(the $180k laser)*
**Triggers:** "is this a good deal", "should I buy/finance…", "what's the payback on…", "$X machine/equipment/vehicle".
**Inputs:** price, financing (APR, term, down payment), and **unit economics** the user confirms or Navi infers from their data: average revenue per unit/treatment, gross margin %, expected volume/month.
**Computes:** `capexAnalysis` → monthly payment, break-even units, payback period, ROI, runway impact; flags Section 179 / depreciation as a *consideration* (not tax advice).
**Answer (matches deck card):** Verdict ("Yes — *if* your volume delivers the expected return"), three stat tiles (Avg client value, Gross margin, Break-even treatments), a plain-English "what this means" ("≈115 treatments to pay it back; at 15/mo ≈ 8 months"), Key considerations (lead flow, marketing spend, pre-selling, tax), and **Next steps → run scenarios at 10/15/20/mo** (`scenarioCompare`).

### Template C — Strategic / Board narrative  *(NorthStar boardroom)*
**Triggers:** "how should we think about runway / hiring / path to profitability", "prep me for the board", "what's our story for investors".
**Inputs:** current trajectory (from data) + planned moves (hires, spend plan, growth assumption) the user or board is weighing.
**Computes:** `runwayPath` → projected runway, profitability month, ending cash, cash buffer; `scenarioCompare` for alternatives; `benchmark` for context.
**Answer (matches deck card):** Position statement ("You're in a strong position"), four KPI tiles (Projected runway, Profitability quarter, Ending cash, Cash buffer), "What drives this outcome" (the assumptions in bullets), the projected ARR & runway chart, and a single clear **Recommendation**. Plus a **one-click board export** (PDF/slide) — this is the artifact a founder brings into the room, and a sharing/lock-in surface.

---

## 4. The universal answer contract

Every Navi decision answer, regardless of template, returns this structure (renders as a card; also the JSON the API emits):

1. **Verdict** — a clear yes / no / "yes, if…" / "not yet." Never bury the lede.
2. **The math** — the figures that drove it, each traceable to a tool output (table or tiles).
3. **Assumptions** — explicit, and *editable* ("at 15 treatments/mo", "min cash $500K", "12% growth"). The user can change one and re-run.
4. **Considerations / risks** — what could break the verdict (lead flow, seasonality, a partial month of data).
5. **Scenarios** — offer 2–3 alternatives (`scenarioCompare`) so it's a conversation, not a single number.
6. **Next steps** — the action, and an offer to go deeper.
7. **Provenance & confidence** — "based on data synced 2h ago; 11 months of history; medium confidence (only 2 months of revenue trend)." Plus the standing **"decision support, not licensed financial/tax advice"** line.

---

## 5. Trust & guardrails (non-negotiable)

This is a financial product; a confident wrong answer is worse than no answer.

- **Compute, don't hallucinate** (Section 2) — the LLM is forbidden from emitting a number not present in a tool result. Enforce with structured tool outputs + a post-generation check that every figure in the answer appears in the tool payload.
- **Show the math** — every card can expand to the formula and inputs.
- **Surface assumptions, make them editable** — never hide an assumption inside prose.
- **Partial-data honesty** — if there's <2 months of history, or a missing source, say so and lower confidence; never extrapolate silently. (Consistent with the app's existing "never show demo numbers" stance.)
- **Minimum-cash floor as a first-class setting** — affordability is meaningless without it; default it, let the user set it, and always state it.
- **Not advice** — decision *support*, with a clear line to consult a CPA for tax/legal. (Tax items like Section 179 are flagged as "ask your CPA," not asserted.)
- **Metering** — each decision run consumes credits (the existing Navi credits system), with the cost shown.

---

## 6. Inputs: what Naviio already has vs. what's new

**Already in the platform:** cash balance, monthly burn, runway, MRR/ARR, churn, YTD P&L, gross margin, COGS, vendor/category history, bear/base/bull forecast engine, classification. → Templates A and C are mostly wiring existing engine outputs into the answer contract.

**New, lightweight inputs (user-set assumptions):** minimum-cash floor, unit economics for capex (avg revenue/unit, volume/month — Navi can propose from data and let the user confirm), planned hires/spend for board scenarios. Store these as a per-org **"decision profile"** so Navi gets smarter and faster each time (and so they become switching-cost data).

---

## 7. Moat mechanics — how each answer compounds

- **Decision logs** — persist {question, template, inputs, assumptions, verdict, timestamp, and later the realized outcome}. This dataset is unique to Naviio and is the seed for V2 recommendations and benchmarks.
- **Benchmark grounding** — once N is large enough, answers gain peer context ("comparable seed SaaS at your burn multiple extended runway by hiring in GTM, not eng"). No single-company tool can replicate this.
- **Outcome loop** — follow up ("Did you sign the lease?" / "How many treatments last month?") to compare predicted vs. actual, improving calibration and creating a reason to keep using Navi.
- **Advisor leverage** — fractional CFOs running many clients generate many decisions → faster data-network growth (ties to the deck's partner flywheel).

---

## 8. UX surfaces

- **Mobile prompt card** (deck scenario A/B) — ask in one line, get the decision card; the hero surface for founders.
- **Desktop "AI Advisor" panel** (deck scenario C) — richer, with editable assumptions, scenario toggles, and the board export.
- **Proactive Navi** — the engine also runs *unprompted*: "Your runway dropped below 12 months — here's what extends it," surfaced via Alerts and the Overview "Top Insight / Recommended Action" cards already in the deck mockup.
- **Board export** — Template C → shareable PDF/portal link (reuses existing portal-share + branding).

---

## 9. Build roadmap (tie to "AI Decision Engine V2" milestone)

- **V1 — Grounded templates (the deck's three).** Tool layer + the three templates + answer contract + guardrails + decision logging + credits metering. Ships the demo'd experience for real.
- **V2 — Free-form + scenarios + memory.** Open-ended questions routed to templates; multi-scenario compare; the per-org decision profile; outcome follow-ups. (This is the slide-15 "AI Decision Engine V2".)
- **V3 — Benchmarks + proactive advisor.** Peer benchmarking once N supports it; fully proactive recommendations; advisor multi-client decision console.

---

## 10. Success metrics

- **Decision activation:** % of active orgs that ask Navi ≥1 decision question / month.
- **Decisions per org / month** (frequency = habit = retention).
- **Grounding integrity:** 0 fabricated-number incidents (automated check pass rate).
- **Acted-on rate:** % of decisions where the user took the suggested action (via follow-up).
- **Calibration:** predicted vs. actual on affordability/payback over time.
- **Retention lift:** NRR / 12-mo cohort retention for decision-active vs. inactive orgs.

---

## 11. Risks & how we hold the line

- **Hallucinated numbers** → the compute-don't-hallucinate architecture + post-gen verification. This is existential; treat any breach as a Sev-1.
- **Over-confident verdicts on thin data** → confidence scoring + partial-data honesty; prefer "yes, if…" to a naked "yes."
- **Tax/legal overreach** → flag, don't assert; route to CPA.
- **Generic-LLM commoditization** → the defensibility is the *grounding + decision logs + benchmarks*, not the model. Keep investing there, not in prompt cleverness.
- **Cost** → meter via credits; cache context; keep deterministic tools cheap so only composition hits the model.
