# Naviio Agents

> **Operating model:** all agents follow `.claude/agents/OPERATING-MODEL.md` (AI-native, closed-loop). Read it + `CONVENTIONS.md` first.

Custom Claude Code subagents for building Naviio. Each lives in this folder as a
Markdown file with YAML frontmatter (`name`, `description`, `tools`, `model`) and
a system prompt. Claude Code auto-discovers them; invoke explicitly with
"use the <name> subagent to ..." or let Claude delegate based on the
`description`.

`CONVENTIONS.md` is the shared source of truth every agent reads first.

## The agents

| Agent | Model | Use it for |
|-------|-------|------------|
| `naviio-orchestrator` | opus | Multi-domain features; plans + delegates to specialists, routes through review. |
| `plaid-specialist` | sonnet | Plaid: Link, token exchange, balances/transactions, webhooks, sync. |
| `stripe-specialist` | sonnet | Stripe & Connect: revenue/MRR, payouts, subscriptions, client accounts, webhooks. |
| `accounting-specialist` | sonnet | Accounting accuracy: cash vs accrual basis, US GAAP / ASC 606 revenue recognition, flagging accounting errors (read-only audit). |
| `financial-scoring` | sonnet | The six-metric health model + hexagon radar math. |
| `fpa-specialist` | sonnet | FP&A: forecasting engine, driver-based + cohort forecasts, scenarios, variance/reforecasting, runway stress-testing. |
| `data-db` | sonnet | Prisma schema, migrations, orgId tenancy, queries, Redis cache. |
| `ui-frontend` | sonnet | App Router pages, components, Tailwind, Framer Motion, Recharts, React Query. |
| `code-reviewer` | opus | Security-first review before commit/PR (read-only). |
| `test-engineer` | sonnet | Jest/Testing Library + Playwright tests. |
| `security-legal-specialist` | opus | Security compliance & legal: Plaid attestations, bank/partner diligence, security policies, privacy/terms pages, and the auth security boundary (MFA, sessions, secrets). Advisory on app code; owns the security + legal docs. |

## How they fit together

```
                 naviio-orchestrator  (plans, delegates, integrates)
                          │
   ┌──────────┬───────────┼───────────┬──────────────┐
 data-db   plaid-      stripe-    financial-      ui-frontend
           specialist  specialist  scoring
   └──────────┴───────────┴───────────┴──────────────┘
                          │
                    test-engineer
                          │
                    code-reviewer   (always last — security + correctness)
```

Typical feature flow: data model → integration/scoring logic → API route → UI →
tests → review.

## Conventions all agents share
See `CONVENTIONS.md`. Highlights: Next.js 16 (read `node_modules/next/dist/docs/`
first), `@/` import alias, `requireAuth()` + `Response.json` route pattern,
strict `orgId` tenancy scoping, `Promise.allSettled` integration resilience,
never log secrets/tokens, and the gates `npm run lint` · `npx tsc --noEmit` ·
`npm test` · `npm run build`.

## Tips
- Models are a starting point — bump a specialist to `opus` for hard problems or
  down to `haiku` for cheap mechanical edits by editing its frontmatter.
- Keep `CONVENTIONS.md` current as the codebase evolves; it's the leverage point
  for all agents at once.
- `code-reviewer` and `naviio-orchestrator` are intentionally read-only (no
  Edit/Write) so they advise/coordinate rather than silently change code.
- `security-legal-specialist` is read-only on application code (it audits auth/
  session/MFA and proposes fixes to the owning specialist) but owns and edits the
  security policies, legal pages, and decision logs directly.
