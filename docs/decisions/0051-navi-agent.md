# 0051 — Navi as an in-product, tool-using agent

- **Date:** 2026-06-18
- **Status:** accepted (phases 1–3 shipped)
- **Owner (DRI):** product + AI
- **Builds on:** Navi chat (`/api/insights/chat`), the Navi Decision Engine (0047/0048),
  the metric engine, and the provider router.

## Decision
Turn the in-product Navi from a single-shot snapshot chat into a **tool-using
agent**: it reasons over the user's live financials by calling tools, runs the
deterministic decision engine for "what-if" questions, and answers with real
numbers — multi-step, autonomous within a bounded loop. Customer-facing.

## Principles (the trust layer)
1. **Compute, don't hallucinate.** Every figure comes from a tool result (metric
   engine or decision engine), never the model. The system prompt forbids stating
   any number not returned by a tool.
2. **Reads run freely; actions are confirmed.** Read tools execute inside the loop.
   Side-effecting tools are NEVER auto-executed — they surface to the user as a
   proposed action to confirm (see Phase 2). The tool registry carries a
   `kind: 'read' | 'action'` discriminator so this is structural, not a convention.
3. **Org-scoped.** The route passes the authenticated `orgId` to tools; the model
   never sees or supplies it. Every tool query is scoped to that org.
4. **Metered + refunded.** One `navi_message` credit per turn; refunded if the
   agent produces no answer or errors.

## What shipped (phase 1 — read + reason + engine)
- **Tool registry** (`lib/navi/tools.ts`): `financial_snapshot`, `revenue_metrics`,
  `expenses_by_category`, `recent_transactions`, and `run_decision` (the
  deterministic affordability/capex/runway engine). All read-only, all grounded.
- **Agent loop** (`lib/navi/agent.ts`): Anthropic tool-use cycle, bounded to 6
  steps, executes read tools and feeds results back until a final plain-text
  answer. Emits per-tool activity for live UI feedback.
- **Endpoint** (`/api/navi/agent`): auth + credit metering + refund-on-failure,
  streams SSE — `{tool}` activity, `{text}` answer, `{error}`, `[DONE]`. Falls
  back to a demo message when `ANTHROPIC_API_KEY` is unset.
- **UI**: the Navi chat now calls the agent route and shows tool activity
  ("Reading your P&L and cash…") until the answer streams in.

## Phase 2 — full operator (shipped)
The "full operator" remit lands behind a confirmation contract:
- **Action tools** (`kind: 'action'`) — shipped `trigger_sync` (re-pull + refresh)
  and `reclassify_transaction` (fix a transaction/vendor category). When the model
  calls an action tool the loop does NOT execute it; it emits a `{proposedAction}`
  SSE event (summary + tool + args) and stops. The chat renders a Confirm / Not-now
  card; on confirm, `POST /api/navi/action` runs the named action server-side
  (org-scoped, exact-name match — the client can't invoke arbitrary tools). On
  success the UI fires `naviio:refresh` so dashboards update.
- **Web search** — Anthropic's server-side web-search tool, gated behind
  `NAVI_WEB_SEARCH=1` (off by default). The loop handles `pause_turn`
  continuations. Use for market/benchmark questions; never mixed into the user's
  own figures.
- **Out of scope by construction:** money movement and account/permission/settings
  changes — there are no tools for them, so the agent cannot perform them.

## Phase 3 — shipped
- **Agent-run decisions persist.** A shared `persistDecision` helper
  (`lib/decisions/persist.ts`) is used by both the explicit decision route and the
  agent's `run_decision` tool, so agent decisions also feed the outcome loop /
  follow-up cron. A per-call `NaviToolCtx` (userId + question) is threaded
  route → agent → tool; the model never supplies it.
- **`create_scenario` action tool** — saves a custom forecast scenario
  (growth/churn/opex multipliers, clamped 0–10) behind the same confirm contract.
- **`export_board_pack` action tool** — generates a print-ready HTML financial
  pack (`lib/navi/board-pack.ts`, served at `/api/navi/board-pack`); on confirm
  the chat opens it in a new tab to save as PDF. No PDF dependency — the browser
  does Print → Save as PDF.

## Action set (all behind the confirm contract)
`trigger_sync` · `reclassify_transaction` · `create_scenario` · `export_board_pack`.
Money movement and account/permission/settings changes remain out of scope (no tools).

## Alternatives considered
- *Keep the static-snapshot chat.* Rejected: it can only answer what's pre-baked
  into the prompt and can't investigate (transactions, categories, what-ifs).
- *Let the model do the math.* Rejected outright — violates principle 1 and the
  whole reason the deterministic engine exists.

## Guardrails / verification
- tsc + eslint clean. The model can't widen its own scope: tools are a fixed
  registry, orgId is injected server-side, and only `kind:'read'` tools are passed
  to the model in phase 1.
