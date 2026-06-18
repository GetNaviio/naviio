# 0051 — Navi as an in-product, tool-using agent

- **Date:** 2026-06-18
- **Status:** accepted (phase 1 shipped)
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

## Phase 2 — full operator (designed, not yet built)
The "full operator" remit (act on the app + web) lands behind the confirmation
contract already accounted for in the architecture:
- **Action tools** (`kind: 'action'`) — e.g. `trigger_sync`, `reclassify_transaction`,
  `create_scenario`, `export_board_pack`. The loop, on an action tool call, does
  NOT execute it; it emits a `{proposedAction}` SSE event with a human-readable
  summary + the tool name/args. The UI renders a confirm/decline control; on
  confirm, a separate authenticated endpoint runs the action. Money movement and
  account/permission/settings changes stay out of scope entirely.
- **Web search** — add Anthropic's server-side web-search tool (gated/optional)
  for market or benchmark questions, clearly attributed and never mixed into the
  user's own figures.
- **Decision persistence** — when the agent runs `run_decision`, persist it to the
  `DecisionLog` (as the chat path already does) so the outcome loop applies.

## Alternatives considered
- *Keep the static-snapshot chat.* Rejected: it can only answer what's pre-baked
  into the prompt and can't investigate (transactions, categories, what-ifs).
- *Let the model do the math.* Rejected outright — violates principle 1 and the
  whole reason the deterministic engine exists.

## Guardrails / verification
- tsc + eslint clean. The model can't widen its own scope: tools are a fixed
  registry, orgId is injected server-side, and only `kind:'read'` tools are passed
  to the model in phase 1.
