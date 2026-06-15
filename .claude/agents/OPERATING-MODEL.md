# Naviio Operating Model — AI-Native (canonical)

Adopted from "YC on how to build a company with AI." **This is how Naviio is
built and run — the only structure going forward.** Every agent reads
`CONVENTIONS.md`, which points here. When this doc and habit disagree, this doc wins.

## The 8 principles → how we actually work

**1. AI is the operating system, not a tool.**
Work doesn't get done "with a bit of AI help" — it flows *through* the agent
system. Default path for any build / fix / content task: route to
`naviio-orchestrator`, which delegates to the specialist that owns it. The human
sets direction and judges output; the agents run the workflow.

**2. Closed loops everywhere.**
No task is "done" until its loop closes: **define the target → act → measure →
feed back.** Concretely, every change ends with the quality gates
(`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`) *and* a
recorded outcome. If the measure fails, the loop repeats. We never ship an open
loop — no "looks right, moving on."

**3. Make Naviio queryable.**
Every significant action produces an artifact that's legible to the next agent
and to AI. Decisions → `docs/decisions/`. Content → `social-media/content-log.md`.
Agent behavior → `.claude/agents/`. Build/test results → CI. If it isn't written
down, it didn't happen.

**4. Software factories (spec + tests first).**
Build spec-first: write the spec and the tests that define success, then have an
agent implement until the tests pass. The human defines *what* to build and
judges the result; the agent writes the code. Reference pattern: the pure,
unit-tested `plaid-map.ts` / `stripe-map.ts` mappers.

**5. No human middleware.**
The orchestrator routes work *directly* to the owning specialist — no manual
hand-off an agent could do itself. Every routing layer removed is a direct speed
gain.

**6. Three roles.**
- **Builder-operators** = the specialist agents (`plaid-specialist`,
  `stripe-specialist`, `financial-scoring`, `data-db`, `ui-frontend`,
  `test-engineer`). They build and run their layer and show up with working code,
  not proposals.
- **DRI (directly responsible individual)** = `naviio-orchestrator` for any
  multi-domain outcome. One owner, one outcome, no hiding.
- **AI founder** = Eric — at the forefront, sets conviction and direction,
  judges output. The AI strategy isn't delegated away.

**7. Token-max, not headcount-max.**
Prefer spinning up an agent run over doing it by hand. Lean by design; let the
agents carry the volume.

**8. Early-stage advantage.**
Naviio is AI-native from day one — no legacy process to unwind. Design every
new workflow around the agents from the start.

## How every task runs (the loop — follow this)
1. **Frame** — state the goal + acceptance criteria (these are the "tests").
2. **Route** — orchestrator assigns the owning specialist(s). No middleware.
3. **Build** — specialist writes the spec + failing tests, then implements to green.
4. **Close the loop** — run the gates; `code-reviewer` passes anything touching
   money / auth / tenancy. Fix until green.
5. **Record** — append the decision/outcome to `docs/decisions/` (or the relevant
   log) so Naviio stays queryable.

## Hard rules this model adds
- Every PR-sized change ships with: a spec, tests, passing gates, and a recorded
  artifact.
- `code-reviewer` is the mandatory closing loop on financial-data paths.
- No undocumented decisions — write them to `docs/decisions/`.
