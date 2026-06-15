# 0023 — Security & Legal specialist agent (owner of compliance matter)

- **Date:** 2026-06-09
- **Status:** accepted
- **Owner (DRI):** CEO

## Context
Security-compliance and legal posture (Plaid attestations, bank diligence, security
policies, consumer legal pages, and the authentication security boundary) had grown
into a standing matter spanning multiple documents and the auth code, with a recurring
need to keep claims **honest** (code-backed vs operational vs commitment). It needed a
single accountable owner rather than ad-hoc handling.

## Decision
Created the **`security-legal-specialist`** subagent (`.claude/agents/security-legal-specialist.md`,
model `opus`) as the owner of this matter. Registered it in `.claude/agents/README.md`.

**Scope of ownership:** Plaid Required Attestations (`SEC-ATT-001`); bank-migration
diligence — coverage map (`SEC-MAP-001`) and questionnaire responses (`SEC-QRA-001`)
against the 11 control domains; the security policy set (`SEC-POL-001/002/003`,
`SEC-PROC-001`, `SEC-IRP-001`); consumer legal pages (privacy/terms/contact); and the
auth security boundary (`src/lib/auth.ts`, `api/auth/login`, `api/auth/mfa/*`, the Plaid
link-token MFA gate).

**Boundaries:** read-only on application code — it audits and proposes fixes to the
owning specialist (auth/data-db/ui) — but it directly maintains the security policies,
legal page content, and decision logs. It must run the gates and prove pure-logic
security properties before any control is claimed, and must classify every control as
code-backed / operational / commitment so nothing is overclaimed to a partner. It is not
a licensed attorney and escalates genuine legal questions to outside counsel.

## Why opus
Security and legal reasoning is high-stakes (a false control claim to a bank is a
material risk), matching the read-only `code-reviewer` and `naviio-orchestrator` tier.
