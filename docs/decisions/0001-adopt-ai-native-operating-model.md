# 0001 — Adopt the AI-native operating model

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator (on Eric's direction)

## Context
Eric adopted the framework from "YC on how to build a company with AI" as the
single operating structure for Naviio going forward. We already build through a
Claude Code agent system (orchestrator + specialists) with quality gates and
spec+test patterns, so this formalizes and enforces it.

## Decision
Codify the 8 principles as Naviio's canonical operating model:
1. AI as the operating system, not a tool.
2. Closed loops everywhere.
3. Make Naviio queryable.
4. Software factories (spec + tests first).
5. No human middleware.
6. Three roles: builder-operator (specialist agents), DRI (orchestrator), AI founder (Eric).
7. Token-max, not headcount-max.
8. Early-stage advantage — AI-native from day one.

Canonical doc: `.claude/agents/OPERATING-MODEL.md`. It is referenced by
`CONVENTIONS.md`, which every agent reads first, so all subagents now operate
under it. The orchestrator runs the frame → route → build → close-loop → record
loop on every feature.

## Consequences
- Every PR-sized change must ship with a spec, tests, passing gates, and a
  recorded decision artifact.
- code-reviewer is mandatory on money/auth/tenancy paths.
- Decisions live here in `docs/decisions/` — the company stays queryable.
- The people/budget principles (token-max, employee archetypes, API spend) are
  Eric's org calls; reflected here as agent roles, not auto-enforced in code.

## Loop / verification
The model is "working" when: new work routes through the orchestrator, lands with
tests + green gates, and leaves a decision entry here. Drift = a change shipped
with no test or no artifact.

## Follow-ups
- Apply retroactively-light: future changes follow the loop; we won't backfill
  decision entries for already-shipped work unless revisited.
