# 0048 — Navi decision persistence, outcomes & proactive follow-ups

- **Date:** 2026-06-17
- **Status:** accepted
- **Owner (DRI):** product + AI
- **Builds on:** 0047 (Navi Decision Engine)

## Decision
Make the Navi Decision Engine a *learning* system: persist every decision, let
users record what they actually did, and have Navi proactively chase the outcome.
This turns the decision log from a record into the proprietary, compounding
dataset behind the moat (predicted verdict vs. realized outcome).

## What shipped
1. **Persistence** — `DecisionLog` model + migration. Each computed decision
   writes: org, user, template, the NL question, inputs/assumptions, verdict,
   headline, confidence, and a full JSON snapshot of the answer. `/api/navi/decision`
   (POST) persists via a parameterized raw insert and returns the new `decisionId`.
   `GET` lists the org's recent decisions.
2. **Outcome capture** — `PATCH /api/navi/decision { id, outcome }` records
   `proceeded | deferred | declined` (+ optional note, `outcomeAt`), org-scoped.
   The decision drill-down (`NaviDecisionDrawer`) shows "Did you act on this?"
   buttons; the chat carries the `decisionId` so the user can reopen and mark it
   any time.
3. **Proactive follow-up** — daily cron `/api/cron/decision-followups`
   (Bearer `CRON_SECRET`) finds decisions >7 days old with no outcome, raises an
   `Alert` ("you weighed X — did you go ahead?"), and stamps `followedUpAt` so a
   decision is never pinged twice. Surfaces through the existing notifications
   bell + Alerts page. Added to `vercel.json` (15:00 UTC).

## Notes
- Writes use raw parameterized SQL rather than the typed `prisma.decisionLog`
  API because CI/sandbox can't always regenerate the Prisma client; correct in
  prod and type-checks cleanly. Reads/updates are org-scoped.
- Non-blocking: a failed log insert never breaks the decision response; the cron
  and `GET` degrade gracefully if a migration is pending.
- Privacy/retention: `DecisionLog` cascade-deletes with the org.

## Migrations (run on prod)
- `20260617000000_decision_log` — create `DecisionLog`.
- `20260617010000_decision_followup` — add `DecisionLog.followedUpAt`.
`npx prisma migrate deploy` with the prod direct connection string.

## The flywheel
ask → ground → decide → **log → follow up → learn**. Accumulated decisions +
outcomes are the raw material for calibration ("Navi said yes; N of M who
proceeded were glad") and, at scale, peer benchmarks — the data-network moat that
a single-company tool cannot reproduce.

## Verification
- `tsc` + `eslint` clean; `vercel.json` valid. Engine/parse unit tests unchanged
  and passing. Cron auth mirrors the existing `sync`/`purge` pattern.
