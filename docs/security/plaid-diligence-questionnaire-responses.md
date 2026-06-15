# Plaid Security Diligence Questionnaire — Prepared Responses

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-QRA-001                        |
| **Version**      | 1.0                                |
| **Effective**    | June 9, 2026                       |
| **Owner**        | Eric Franco, CEO                   |
| **Next Review**  | December 9, 2026                   |
| **Status**       | Active                             |

---

## How to use this document

Plaid's diligence questionnaire is organized around the eleven control domains in its
*Security Best Practices Guide*. This document provides a prepared, citeable answer for
each, mapped to Naviio's policies so they can be attached as reference documents. Per
Plaid's guidance, every item is answered; where a control is scale-appropriate rather than
fully matured, that is stated honestly rather than overclaimed.

**Before submitting, fill every `[bracketed]` field** — these are facts only the company can
supply (legal identity, EIN, headcount). Attach the cited policy files as references.

Reference documents: `SEC-POL-001` (Information Security Policy), `SEC-POL-002` (Access
Controls Policy), `SEC-PROC-001` (Data Handling Procedures), `SEC-POL-003` (Data Retention &
Disposal), `SEC-IRP-001` (Incident Response Plan), `SEC-ATT-001` (Plaid Attestations),
`SEC-MAP-001` (Diligence Coverage Map), and the published Privacy Policy at `/privacy`.

---

## 0. Company and legal

**Legal entity name:** [Naviio, Inc. — confirm exact registered name]
**EIN / US tax ID:** [__-_______]  *(Plaid uses this for identity and reputation checks.)*
**State / date of incorporation:** [state], [date]
**Primary product:** A financial-intelligence dashboard that connects a business's bank
(via Plaid), payments (Stripe), and accounting (QuickBooks/Xero) data to produce a
real-time P&L, cash-flow, and KPI view.
**Where Plaid Link is deployed:** The authenticated Naviio web application (Integrations tab).
**Do you have a SOC 2?** [No — not yet obtained / In progress, expected [date]]. Not required
for this process; this questionnaire stands on its own.

---

## 1. Information Security Governance

**Q: Do you have a documented, approved information security policy? Who owns it?**
Yes. Naviio maintains a documented Information Security Policy (`SEC-POL-001`), approved and
owned by the CEO, Eric Franco, and reviewed at least annually or after any significant
incident or material change. It is supported by topic-specific policies for access control,
data handling, retention/disposal, and incident response.

**Q: Who is responsible for security?**
Security is owned at the executive level by the CEO. At current headcount ([N] employees),
there is not a dedicated security team; security responsibilities are centralized with the
CEO/Engineering Lead, and a dedicated function will be established as the team scales.

*Reference: `SEC-POL-001`.*

## 2. Access Management

**Q: How is access to sensitive systems and data controlled?**
Access follows least privilege across defined tiers (T1–T5) in the Access Controls Policy
(`SEC-POL-002`). Access to production systems and customer financial data requires
documented approval, is reviewed quarterly, and is revoked within **2 hours** of termination.

**Q: What authentication controls are in place?**
Strong authentication (username + password + second factor) gates access. Application
accounts support TOTP-based MFA, and **MFA is enforced at login** — when enabled, a valid
password alone does not create a session; a second factor is required (`SEC-ATT-001`, ATT-1).
Connecting a bank via Plaid Link is additionally hard-gated on MFA being enabled.

**Q: How are secrets/credentials managed?**
Secrets and API tokens are stored exclusively in AWS Secrets Manager, never in source code
or committed config. GitHub secret scanning is enabled on all repositories; a detected secret
triggers immediate rotation and an incident log entry.

*References: `SEC-POL-002`, `SEC-ATT-001`.*

## 3. Assets Management

**Q: How do you track assets and manage vulnerabilities?**
A register of production assets (cloud accounts/infrastructure, SaaS systems holding data,
repositories, company-managed endpoints) is maintained with an assigned owner per asset and
reviewed at least quarterly (`SEC-POL-001` §6). Dependencies are scanned via `npm audit` on
every CI build (critical findings block deployment) and monitored by GitHub Dependabot.
OS-level critical patches are applied within 7 days (30 days for high).

**Q: What endpoint protection is in place?**
Company-managed workstations run an up-to-date endpoint anti-malware/EDR agent, full-disk
encryption (FileVault/BitLocker), MDM with remote wipe, and 5-minute screen locks.

*References: `SEC-POL-001` §6 & §9, `SEC-POL-003`.*

## 4. Change Management

**Q: How are code changes controlled and tested before production?**
All code lives in a version-controlled GitHub repository. Changes go through pull-request
review and an automated CI pipeline whose gates (lint, type-check, tests) must pass before
deployment; critical dependency vulnerabilities block the build. Secret scanning runs on
every repository.

*References: `SEC-POL-001`, `SEC-POL-002`.*

## 5. Cryptography

**Q: How is data encrypted at rest and in transit?**
At rest: all customer data in AWS RDS PostgreSQL is encrypted with **AES-256** (KMS-managed);
S3 report storage uses SSE-S3 (AES-256); OAuth tokens/API keys are additionally encrypted at
the application layer before persistence. In transit: **TLS 1.2+** for all
customer-to-Naviio traffic (TLS 1.0/1.1 explicitly disabled); internal service-to-service
traffic is encrypted within the AWS VPC.

**Q: How are encryption keys managed?**
AWS KMS is the authoritative key store; application-layer keys rotate annually or on
suspected compromise. No employee has direct access to production keys; key usage is logged
in CloudTrail.

*Reference: `SEC-POL-001` §3.*

## 6. Logging and Monitoring

**Q: What is logged, and how do you detect anomalies?**
AWS CloudTrail records infrastructure and key-usage events; GuardDuty provides threat-based
anomaly detection; WAF alarms and access logs cover the application edge. Authentication
events (sign-up, login attempts) and access to customer financial data are logged and
auditable.

*References: `SEC-POL-001`, `SEC-IRP-001`.*

## 7. Network Security

**Q: How is your production network secured?**
Naviio is remote-first with no on-premises servers; all production infrastructure runs in an
AWS VPC. Inbound traffic is fronted by a WAF, internal traffic is encrypted, and access to
infrastructure follows the approval/least-privilege model in `SEC-POL-002`.

*References: `SEC-POL-001` §5, `SEC-POL-002`.*

## 8. Incident Response

**Q: Do you have an incident response process? Who responds?**
Yes (`SEC-IRP-001`). Incidents are classified (Critical/High/Medium/Low); the CEO is the
Incident Response Lead. Process covers triage → investigation → containment/mitigation →
communication → blameless post-mortem (within 5 business days for Critical/High). Affected
customers are notified within **72 hours** of a confirmed qualifying breach; **Plaid is
notified within 24 hours** of any confirmed incident involving Plaid-connected data.

**Q: What is your on-call coverage?**
Stated honestly for current scale: a single-responder arrangement — production and security
alerts page the Incident Response Lead via PagerDuty, reachable outside business hours. A
multi-responder rotation with a documented secondary/escalation responder will be established
as the engineering team grows; an external IR firm is the planned escalation for incidents
beyond internal capacity.

*Reference: `SEC-IRP-001`.*

## 9. Vendor Management

**Q: How do you manage third-party/sub-processor risk?**
Critical vendors are inventoried with the data each receives (`SEC-POL-001` §7): Plaid,
Stripe, Intuit (QuickBooks), AWS, Vercel, and Anthropic. Vendors are expected to maintain
SOC 2 Type II or equivalent (reviewed annually) and DPAs where applicable; vendor tokens live
in AWS Secrets Manager. Data sent to the AI provider is limited to aggregate financial
summaries — raw transactions, account numbers, and PII are never transmitted. A sub-processor
register is maintained in `SEC-PROC-001` §10.

*References: `SEC-POL-001` §7, `SEC-PROC-001`.*

## 10. Human Resources

**Q: Do you screen and train employees?**
Yes (`SEC-POL-001` §10, "Personnel Security and Awareness"). Employees and contractors with
access to production or customer data undergo a pre-employment background check and sign a
confidentiality/NDA plus policy acknowledgement before access is granted. Security awareness
training is completed within 30 days of hire, with annual refreshers and phishing simulations
at least twice a year.

*Reference: `SEC-POL-001` §10.*

## 11. Independent Testing

**Q: Do you use independent third parties to test your security?**
Yes. A penetration test is conducted annually by a qualified third-party firm, with
severity-based remediation SLAs (Critical ≤ 7 days, High ≤ 30, Medium ≤ 90). Naviio does not
currently run a public bug-bounty program (optional; may be adopted as the user base grows).

*Reference: `SEC-POL-001` §6.*

---

## Privacy (consumer-facing)

**Q: Do you have a published privacy policy?**
Yes — published in the application at `/privacy`, alongside Terms and Contact pages. Data
collection, use, retention, and sub-processors are described and backed by `SEC-PROC-001` and
`SEC-POL-003` (`SEC-ATT-001`, ATT-5). [Confirm the policy explicitly names Plaid as a
data-access mechanism and lists the data categories accessed via Plaid.]

---

*Prepared responses for the Plaid Bank-Migration Security Diligence Questionnaire. Fill all
`[bracketed]` fields and attach the cited policies before submission.*
