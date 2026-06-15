# Plaid Required Attestations — Control Register

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-ATT-001                        |
| **Version**      | 1.0                                |
| **Effective**    | June 9, 2026                       |
| **Owner**        | Eric Franco, CEO                   |
| **Next Review**  | December 9, 2026                   |
| **Status**       | Active                             |

---

## 1. Purpose and Scope

This register documents the six security attestations Naviio, Inc. ("Naviio") has affirmed to **Plaid** as a condition of production access to the Plaid API. Plaid Link is deployed in the Naviio consumer-facing web application to let customers connect their bank accounts.

For each attestation this document records the requirement as worded by Plaid, the control that satisfies it, the owner, the supporting evidence (code, configuration, or policy), and the verification cadence. It is the single source of truth used to keep the attestations current and to respond to Plaid or partner-bank security reviews.

Attestations are mapped to the controlling internal policies rather than duplicating them. The governing documents are:

- Information Security Policy — `SEC-POL-001` (`information-security-policy.md`)
- Access Controls Policy — `SEC-POL-002` (`access-controls-policy.md`)
- Data Handling Procedures — `SEC-PROC-001` (`data-handling-procedures.md`)
- Data Retention & Disposal Policy — `SEC-POL-003` (`data-retention-disposal-policy.md`)
- Incident Response Plan — `SEC-IRP-001` (`incident-response-plan.md`)

Two classes of control appear below. **Technical controls** are enforced in the codebase and verifiable from source. **Operational controls** are organizational and enforced through policy and process; their evidence is the governing policy and its review record, not application code. Each attestation is labeled accordingly so the distinction is not blurred.

---

## 2. Attestation Register

### ATT-1 — Multi-Factor Authentication on the consumer-facing application

> **Plaid requirement:** Robust multi-factor authentication is enforced on the consumer-facing application where Plaid Link is deployed.

**Type:** Technical control.

**How Naviio satisfies it.** The Naviio application supports TOTP-based multi-factor authentication for user accounts. A user enrolls by generating a secret and scanning a QR code, then proves possession of the authenticator before MFA is activated. Authentication state is carried in an `httpOnly` session cookie (`markup_session`) issued by the custom JWT layer; every protected route resolves the session through `requireAuth()`.

**Evidence.**
- `src/app/api/auth/mfa/setup/route.ts` — generates the TOTP secret and QR code (does not enable MFA until a code is verified).
- `src/app/api/auth/mfa/enable/route.ts`, `.../verify/route.ts`, `.../disable/route.ts` — verify-before-enable, challenge, and teardown flows.
- `src/lib/mfa.ts` — `generateSecret`, `generateOtpUri`, `generateQRCode`.
- `src/lib/auth.ts` — `requireAuth()`, session issuance, `httpOnly` cookie.
- `src/app/api/auth/login/route.ts` — **login enforcement**: when `mfaEnabled`, a valid password yields only a short-lived pre-auth token (not a session) and redirects to the second-factor challenge.
- `src/app/api/auth/mfa/verify/route.ts` — verifies the TOTP code against the pre-auth cookie identity (never a client-supplied `userId`) and only then mints the session.
- `src/app/(auth)/login/mfa/page.tsx` — the second-factor challenge screen.
- `src/app/api/auth/plaid/create-link-token/route.ts` — **connect gate** (defense in depth): refuses to issue a Plaid Link token (HTTP 403, `MFA_REQUIRED`) unless `mfaEnabled === true`.
- `src/components/integrations/PlaidLink.tsx` — surfaces the connect gate with a prompt to enable two-factor in Settings.
- `src/lib/auth.ts` — `signPreAuthToken` / `verifyPreAuthToken`; `verifyToken` rejects any `mfaPending` token so a pre-auth token can never be replayed as a full session.
- Policy cross-reference: `SEC-POL-002` §4.2 (MFA mandatory) and §4.3 (application-level TOTP MFA).

**Owner:** CEO / Engineering.

**Enforcement.** MFA is **enforced at authentication**, not merely available. When an account has two-factor enabled, the password alone never produces a session — a second factor is required at every login. The Plaid Link connect path additionally refuses to issue a link token without MFA, so two-factor is a hard precondition for connecting a bank (defense in depth; both checks are server-side and cannot be bypassed by the client). The legacy hardcoded demo credential (`demo@…` / static password) is disabled in production (`NODE_ENV === 'production'`) and removed from the login form, eliminating a shared no-MFA bypass. Forcing MFA enrollment for *every* account at sign-up (vs. enforcing it once enabled + gating bank connect) remains an optional future hardening step.

---

### ATT-2 — Centralized Identity and Access Management

> **Plaid requirement:** Identity and access management is centralized.

**Type:** Operational control (with technical enforcement in-app).

**How Naviio satisfies it.** Application identities resolve through a single authentication layer (`src/lib/auth.ts`) — there is one session mechanism, one authorization check, and no parallel ad-hoc auth paths. Workforce access to infrastructure and SaaS is governed centrally under `SEC-POL-002`, which defines the access tiers (T1–T5), the principle of least privilege, and a single approval path for granting access.

**Evidence.**
- `src/lib/auth.ts` — single source of session/identity resolution for the app.
- Policy cross-reference: `SEC-POL-002` §3 (access tiers), §4 (authentication requirements), §5 (lifecycle).

**Owner:** CEO.

**Remediation note.** "Centralized IAM" is strongest when workforce identity is fronted by a single identity provider (SSO/IdP) with MFA. Tracking item: record the designated IdP for workforce SSO in `SEC-POL-002` and confirm all admin SaaS access is federated through it.

---

### ATT-3 — Zero Trust Access Architecture

> **Plaid requirement:** A zero trust access architecture is in place.

**Type:** Operational control.

**How Naviio satisfies it.** Access decisions are made per-request and per-resource rather than by network location. Every protected API route independently re-validates the session via `requireAuth()` — no route trusts an upstream gateway or network position. Workforce access follows least-privilege tiers with time-limited, task-scoped elevation and is reviewed and revoked on a defined cadence under `SEC-POL-002`.

**Evidence.**
- `src/lib/auth.ts` + per-route `requireAuth()` usage — no implicit trust; identity is verified on each request.
- Policy cross-reference: `SEC-POL-002` §3 (least privilege), §4 (per-session verification), §5 (time-limited, task-scoped access).

**Owner:** CEO / Engineering.

**Remediation note.** Full zero-trust posture additionally implies device/context signals on workforce access. Tracking item: document the conditional-access / device-posture requirements for administrative access in `SEC-POL-002`.

---

### ATT-4 — Automated De-provisioning on Termination or Transfer

> **Plaid requirement:** Access for terminated or transferred employees is de-provisioned or modified in an automated, timely manner.

**Type:** Operational control.

**How Naviio satisfies it.** The Access Controls Policy defines mandatory revocation SLAs on separation: access for departed employees and contractors is revoked within **2 hours** of termination, and involuntary terminations are actioned within **2 hours** of notification. Role transfers trigger access modification under the same lifecycle section. Vendor access is reviewed quarterly and revoked immediately on contract termination.

**Evidence.**
- Policy cross-reference: `SEC-POL-002` §5 (joiner/mover/leaver lifecycle; revocation SLAs) and the involuntary-termination row ("Within 2 hours of notification").
- `SEC-POL-001` §revocation — access revoked within 2 hours of termination.

**Owner:** CEO.

**Remediation note.** The SLA is documented; "automated" is strongest when de-provisioning is driven by the IdP/HR system rather than a manual checklist. Tracking item: tie the offboarding trigger to the central IdP so disabling one identity cascades to federated systems, and retain the de-provisioning log as evidence.

---

### ATT-5 — Published Privacy Policy

> **Plaid requirement:** A privacy policy is published and accessible to consumers.

**Type:** Technical control.

**How Naviio satisfies it.** A privacy policy is published in the application and reachable at `/privacy`; terms and contact pages are published alongside it. The pages render through the shared legal route view, so the published content has a single canonical source.

**Evidence.**
- `src/app/privacy/page.tsx` — published Privacy Policy route (`/privacy`).
- `src/components/legal/LegalRouteView.tsx` — canonical legal content renderer.
- `src/app/terms/page.tsx`, `src/app/contact/page.tsx` — companion legal routes.
- Data-handling cross-reference: `SEC-PROC-001` §10 (sub-processors) backs the disclosures the policy makes.

**Owner:** CEO.

**Remediation note.** Confirm the published policy explicitly names Plaid as a data-access mechanism and lists the data categories accessed via Plaid, consistent with Plaid's end-user disclosure expectations.

---

### ATT-6 — Vulnerability Scanning

> **Plaid requirement:** Vulnerability scanning is performed on the application and its dependencies.

**Type:** Technical control.

**How Naviio satisfies it.** Dependencies are scanned via `npm audit` on every CI build, with critical vulnerabilities blocking deployment, and GitHub Dependabot monitors dependencies for known CVEs and opens automated remediation pull requests. GitHub secret scanning is enabled on all repositories; a detected secret triggers immediate rotation and an incident log entry. Runtime threat detection (AWS GuardDuty) and Dependabot alerts feed the incident-response process.

**Evidence.**
- Policy cross-reference: `SEC-POL-001` §6 (Vulnerability Management — `npm audit` on every CI build; Dependabot).
- `SEC-POL-002` — GitHub secret scanning enabled on all repositories.
- `SEC-IRP-001` — detection sources: AWS GuardDuty, GitHub Secret Scanning, Dependabot Alerts.

**Owner:** CEO / Engineering.

**Remediation note.** Dependency and secret scanning are in place. Tracking item: add periodic application-level scanning (SAST and/or an authenticated DAST pass against a staging deploy) and record the cadence here so coverage extends beyond dependencies to application code.

---

## 3. Attestation Summary

| ID    | Attestation                                  | Type        | Status   | Primary evidence |
|-------|----------------------------------------------|-------------|----------|------------------|
| ATT-1 | MFA on consumer-facing app (enforced for bank connect) | Technical | Attested | `create-link-token/route.ts` gate + `src/app/api/auth/mfa/*` |
| ATT-2 | Centralized IAM                              | Operational | Attested | `src/lib/auth.ts`, `SEC-POL-002` §3–5 |
| ATT-3 | Zero trust access architecture               | Operational | Attested | per-route `requireAuth()`, `SEC-POL-002` §3–5 |
| ATT-4 | Automated de-provisioning on termination     | Operational | Attested | `SEC-POL-002` §5, `SEC-POL-001` |
| ATT-5 | Published privacy policy                     | Technical   | Attested | `src/app/privacy/page.tsx` (`/privacy`) |
| ATT-6 | Vulnerability scanning                        | Technical   | Attested | `SEC-POL-001` §6, `SEC-IRP-001` |

All six attestations are **Attested** to Plaid. The "remediation note" under each item lists the hardening step that strengthens the attestation from supported to fully enforced; these are tracked as open items and reviewed at the cadence below.

---

## 4. Review and Maintenance

This register is reviewed **every six months** (next review above) and immediately upon any of the following: a change to the authentication or authorization layer, a change to the offboarding process or identity provider, a change to the published legal pages, a change to the CI/scanning pipeline, or a request from Plaid or a partner bank. The Owner is responsible for confirming each control remains accurate and that the cited evidence still exists at the referenced location.

---

*This document is an internal control register. It records attestations made to Plaid and the controls that support them; it does not itself grant access or modify system behavior.*
