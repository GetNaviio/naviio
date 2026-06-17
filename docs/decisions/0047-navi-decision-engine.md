# 0047 — Navi Decision Engine

- **Date:** 2026-06-17
- **Status:** accepted
- **Owner (DRI):** product + AI
- **Companion:** `docs/navi-decision-engine-blueprint.md`

## Decision
Navi answers forward-looking decision questions ("can we afford this lease?",
"is this $180k machine a good buy?", "how's our runway and path to
profitability?") inside the **chat**, with the answer rendered as a
transactions-style **drill-down drawer** organized like the pitch-deck examples.

## Core principle — compute, don't hallucinate
The LLM never does arithmetic on the customer's money. The flow:

1. **Detect & route** — `parseDecisionQuestion` (deterministic) decides whether a
   chat message is a real decision question and which template it is. Ordinary
   questions fall through to the normal chat reply.
2. **Gather inputs** — required params missing → Navi asks for them and collects
   them across turns (`extractSlots` deterministic reader; **`/api/navi/extract`**
   LLM fallback for free-form replies; deterministic fallback if no key/error).
   The LLM only parses values the user stated.
3. **Compute** — `/api/navi/decision` runs the **deterministic engine**
   (`src/lib/decisions/engine.ts`) over the org's live financial context
   (`context.ts`, from the real ledger/cash). Every figure originates here.
4. **Answer** — composed into the universal answer contract (`templates.ts`):
   verdict → figures → assumptions → considerations → next steps → provenance +
   not-advice line. Rendered in `NaviDecisionDrawer`.

## Three templates (V1)
- **affordability** — one-time / recurring cost vs. a minimum-cash floor.
- **capex** — payback, break-even units, ROI, financing.
- **runway_path** — runway, profitability month, ending cash; board export (print).

## Key files
- `src/lib/decisions/engine.ts` — pure math (unit-tested).
- `src/lib/decisions/context.ts` — live financial context adapter.
- `src/lib/decisions/templates.ts` — answer-contract composition.
- `src/lib/decisions/parse.ts` — NL routing + slot extraction (`REQUIRED`,
  `missingParams`, `extractSlots`).
- `src/app/api/navi/decision/route.ts` — compute endpoint (auth + credits-metered,
  refunds on failure).
- `src/app/api/navi/extract/route.ts` — LLM slot-extraction fallback.
- `src/components/navi/NaviDecisionDrawer.tsx` — drill-down UI.
- Chat integration: `src/components/ChatBot.tsx`.

## Guardrails
- Numbers come only from the engine; a decision answer never shows a model-authored
  figure. The LLM is limited to (a) normal chat prose and (b) extracting
  user-stated values into named slots.
- Partial data → lower confidence; missing bank → "connect a bank", not a guess.
- Metered via the existing `navi_message` credit; charge refunded if compute fails.

## Why this is the moat
Each decision is proprietary, compounding data (the question, assumptions, verdict,
and later the realized outcome) that no competitor who didn't host the decision
has — seeding benchmarks and better recommendations over time (see blueprint §0/§7).

## Verification
- `tsc` + `eslint` clean. Unit tests: `tests/lib/decisions.test.ts` (engine math),
  `tests/lib/decision-parse.test.ts` (routing, money parsing, slot filling).
- Engine + parser also verified numerically against the deck's exact phrasings.
- LLM extract path is structure-verified; deterministic fallback covers no-key/error.
