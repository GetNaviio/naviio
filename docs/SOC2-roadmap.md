# SOC 2 Roadmap

Naviio handles sensitive financial data for founders and fractional-CFO firms.
SOC 2 is the report those buyers ask for. This document maps the controls we
**already** have to the SOC 2 Trust Services Criteria (TSC) and lays out the
path to Type I and then Type II.

Status legend: ✅ in place · 🟡 partial · ⬜ not started

---

## Trust Services Criteria → current controls

### Security (Common Criteria — required for every SOC 2)

| Control area | Status | Implementation in Naviio |
|---|---|---|
| Access control / authentication | ✅ | Custom JWT sessions (httpOnly, Secure, SameSite); bcrypt (cost 12) password hashing |
| Multi-factor authentication | ✅ | TOTP authenticator apps + WebAuthn passkeys; MFA enforced before bank connection |
| Least privilege / RBAC | 🟡 | Org roles `OWNER` / `MEMBER` / `ADVISOR`; advisor cannot touch billing, integrations, members, or deletion. Firm Partner/Analyst tiers in progress |
| Encryption in transit | ✅ | TLS everywhere (managed by Vercel edge / platform) |
| Encryption at rest | ✅ | Neon Postgres AES-256 at rest **plus** an application-layer AES-256-GCM envelope on stored OAuth/provider tokens (`lib/crypto.ts`) |
| Secrets management | ✅ | Secrets in platform env (Vercel) / AWS Secrets Manager (Terraform); never in source |
| Audit logging | 🟡 | `AccessLog` records who accessed which client org and when; expand to cover more privileged actions |
| Vulnerability management | 🟡 | Dependency updates + lint/type gates in CI; add scheduled dependency scanning + pen-test before Type II |
| Change management | 🟡 | Git-based review, decision log (`docs/decisions/`); formalize PR approval + branch protection |
| Vendor management | 🟡 | Key subprocessors: Vercel (hosting), Neon (database), Stripe (payments), Plaid (bank data), Anthropic (AI). Maintain a subprocessor register |

### Availability

| Control | Status | Notes |
|---|---|---|
| Hosting redundancy | ✅ | Vercel + Neon managed, multi-AZ |
| Backups / recovery | 🟡 | Neon point-in-time restore; document RPO/RTO + test restores |
| Monitoring / alerting | 🟡 | Add uptime + error monitoring with on-call escalation |

### Confidentiality

| Control | Status | Notes |
|---|---|---|
| Data classification | 🟡 | Documented in the information-security policy; formalize tiers |
| Retention & disposal | ✅ | Account deletion endpoint + 30-day grace + nightly purge cron (`/api/cron/purge`) |
| Token revocation | ✅ | Session denylist on logout; provider tokens cleared + revoked on disconnect |

### Processing Integrity

| Control | Status | Notes |
|---|---|---|
| Deterministic financial engine | ✅ | "Compute, don't hallucinate" — figures derived from the ledger, unit-tested |
| AI governance | ✅ | AI output carries an informational-only disclaimer reviewed-by-a-professional notice |

### Privacy

| Control | Status | Notes |
|---|---|---|
| Privacy policy | ✅ | Public `/privacy` |
| Data subject rights | ✅ | Self-serve account + data deletion |
| Consent for advisor access | ✅ | Clients explicitly grant a firm access; recorded |

---

## Timeline

**Phase 0 — Foundations (now)**
Publish the trust page, ship the AI disclaimer, finish Partner/Analyst RBAC,
maintain the subprocessor register, and write down policies (already drafted in
`docs/`).

**Phase 1 — SOC 2 Type I (target: within 6 months)**
Type I attests that controls are *designed* correctly at a point in time.
- Engage an auditor and a compliance platform (e.g. Vanta / Drata / Secureframe)
- Close the 🟡 gaps: scheduled vuln scanning, formal change management + branch
  protection, monitoring/alerting with on-call, documented backup/restore tests
- Complete a readiness assessment, then the Type I audit

**Phase 2 — SOC 2 Type II (target: 6–12 months after Type I)**
Type II attests that controls *operated effectively* over a window (typically
3–12 months) of continuous evidence.
- Run controls continuously and collect evidence via the compliance platform
- Independent penetration test
- Complete the Type II observation window and audit

> Most CFO firms will eventually ask for SOC 2. Type I unlocks mid-market deals;
> Type II is what larger accounts require — without it we lose those accounts.
