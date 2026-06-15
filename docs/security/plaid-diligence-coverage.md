# Plaid Bank-Migration Diligence — Control Coverage Map

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-MAP-001                        |
| **Version**      | 1.0                                |
| **Effective**    | June 9, 2026                       |
| **Owner**        | Eric Franco, CEO                   |
| **Next Review**  | December 9, 2026                   |
| **Status**       | Active                             |

---

## 1. Purpose

Plaid's *Security Diligence Questionnaire & Best Practices Guide* (Plaid Confidential,
last updated Jan 26 2021) defines a baseline of **eleven control domains** expected of
any developer that collects, processes, or stores consumer PII through Plaid. This map
cross-references each domain to Naviio's existing security documentation so the
questionnaire can be answered with citations, and it flags the genuine gaps honestly.

Plaid is explicit that there are *no "right" answers* and that an early-stage company may
answer "we will enhance this as we scale" for controls not yet formalized. The gaps below
are written so they can be answered that way truthfully.

Reference policies: Information Security Policy (`SEC-POL-001`), Access Controls Policy
(`SEC-POL-002`), Data Handling Procedures (`SEC-PROC-001`), Data Retention & Disposal
(`SEC-POL-003`), Incident Response Plan (`SEC-IRP-001`), Plaid Attestations (`SEC-ATT-001`).

## 2. Coverage by control domain

| # | Plaid control domain | Status | Where it lives | Notes / gap |
|---|----------------------|--------|----------------|-------------|
| 1 | **Information Security Governance** | ✅ Covered | `SEC-POL-001` (documented, approved, owner, annual review) | Security function is founder-owned at current scale; no dedicated security staff yet. |
| 2 | **Access Management** | ✅ Strong | `SEC-POL-002` tiers T1–T5; approval, quarterly review, revocation SLA (2 h); **MFA now enforced at login** (`SEC-ATT-001` ATT-1) | Strongest domain. SSO/IdP federation is the next hardening step. |
| 3 | **Assets Management** | ✅ Covered | `SEC-POL-001` §6 — vuln scans (`npm audit`, Dependabot, annual pen-test) **+ asset inventory + endpoint protection**; MDM + full-disk encryption (`SEC-POL-003`) | Gap closed: §6 now documents a quarterly-reviewed asset inventory with owners and an endpoint anti-malware/EDR agent. |
| 4 | **Change Management** | ✅ Covered | `SEC-POL-001` / `SEC-POL-002` (GitHub version control, code review, CI; secret scanning) | Consider documenting required CI gates (lint/type/test) explicitly. |
| 5 | **Cryptography** | ✅ Strong | `SEC-POL-001` §3 — AES-256 at rest (RDS/S3), TLS 1.2+ in transit, AWS KMS, app-layer token encryption, annual key rotation | TLS 1.0/1.1 explicitly disabled. |
| 6 | **Logging & Monitoring** | ✅ Covered | `SEC-POL-001`; `SEC-IRP-001` — CloudTrail, GuardDuty, access + auth logging | Confirm login-attempt/sign-up events are logged per the guide. |
| 7 | **Network Security** | ✅ Covered | `SEC-POL-001` §5 — AWS VPC, encrypted service-to-service, WAF | Managed-AWS posture; document subnet segmentation if asked. |
| 8 | **Incident Response** | ✅ Covered | `SEC-IRP-001` — triage→investigation→mitigation→comms→post-mortem; PagerDuty paging; quarterly detection tests | Gap closed: §3 now states the single-responder on-call arrangement honestly, with the planned rotation/escalation path. |
| 9 | **Vendor Management** | ✅ Covered | `SEC-POL-001` §7; sub-processor register (`SEC-PROC-001` §10) | Quarterly vendor access review documented. |
| 10 | **Human Resources** | ✅ Covered | `SEC-POL-001` §10 — **pre-employment background checks** + confidentiality/NDA + policy acknowledgement; security awareness training within 30 days | Gap closed: §10 ("Personnel Security and Awareness") now requires background screening before production/customer-data access. |
| 11 | **Independent Testing** | ✅ Covered | `SEC-POL-001` §6 — annual third-party penetration test, severity-based remediation SLAs | No public bug-bounty program (optional, not required). |

## 3. Gap remediation — all closed (2026-06-09)

The three documentation gaps identified in the first pass have been closed. All eleven
control domains are now documented.

1. **HR — background checks (domain 10).** ✅ Closed. `SEC-POL-001` §10 retitled "Personnel
   Security and Awareness"; now requires pre-employment background checks and a signed
   confidentiality/NDA + policy acknowledgement before production or customer-data access.
2. **Assets — endpoint protection & inventory (domain 3).** ✅ Closed. `SEC-POL-001` §6
   ("Vulnerability and Asset Management") now documents a quarterly-reviewed asset inventory
   with assigned owners and a required endpoint anti-malware/EDR agent.
3. **Incident response — on-call (domain 8).** ✅ Closed. `SEC-IRP-001` §3 now states the
   single-responder on-call arrangement honestly and names the planned multi-responder
   rotation and external-IR escalation path.

The only remaining items are operational, not documentation: obtaining a SOC 2 (optional,
not required) and standing up a public bug-bounty program (optional). Neither blocks the
questionnaire.

## 4. How to answer the questionnaire

For each question: if a defined process exists, cite the policy above and attach it as the
reference document. For the three gaps in §3, state the current state plainly and describe
the plan to enhance — which the guide explicitly invites. A SOC 2 is not required; if one is
later obtained it can be referenced directly.

---

*Internal mapping document. It tracks how existing controls answer Plaid's diligence
baseline; it does not itself implement controls.*
