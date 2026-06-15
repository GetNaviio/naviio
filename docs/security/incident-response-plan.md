# Incident Response Plan

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-IRP-001                        |
| **Version**      | 1.0                                |
| **Effective**    | June 1, 2026                       |
| **Owner**        | Eric Franco, CEO (Incident Lead)   |
| **Next Review**  | June 1, 2027                       |
| **Status**       | Active                             |

---

## 1. Purpose and Scope

This Incident Response Plan (IRP) defines how Naviio detects, contains, investigates, communicates, and recovers from security incidents. It applies to all systems and data operated by Naviio, including customer financial data processed via Plaid, QuickBooks, Xero, Stripe, and other integrations.

A **security incident** is any actual or suspected event that threatens the confidentiality, integrity, or availability of Naviio systems or customer data. This includes — but is not limited to — unauthorized data access, data breaches, ransomware, credential compromise, and third-party vendor breaches affecting Naviio.

---

## 2. Incident Severity Classification

| Severity | Definition | Response SLA |
|---|---|---|
| **P0 — Critical** | Confirmed unauthorized access to customer financial data; active system compromise; data exfiltration in progress or confirmed | Immediate — response begins within **1 hour** of detection |
| **P1 — High** | Suspected data exposure; compromised credentials with potential access to production; third-party breach affecting Naviio data; service down for >30 minutes | Response within **4 hours** |
| **P2 — Medium** | Failed intrusion attempts; suspicious activity without confirmed breach; single-account anomaly with no evidence of spread | Response within **24 hours** |
| **P3 — Low** | Policy violations, misconfigured non-production systems, informational security alerts | Response within **72 hours** |

---

## 3. Incident Response Team

| Role | Name | Contact | Responsibility |
|---|---|---|---|
| **Incident Response Lead** | Eric Franco | francoeric34@gmail.com | Owns all P0/P1 incidents; authorizes customer and regulator notification; makes containment and disclosure decisions |
| **Engineering Lead** | Eric Franco | (same) | Technical investigation, containment, and remediation |
| **Legal / Compliance** | Outside counsel (to be retained) | — | Regulatory notification guidance; privilege review of communications |
| **External IR Firm** | TBD (to be contracted) | — | Forensic investigation for P0 incidents beyond internal capacity |

> For P0/P1 incidents occurring outside business hours, Eric Franco is reachable via mobile. All production alerts are routed to his phone via PagerDuty (or equivalent on-call tooling).

> **On-call coverage (current scale, stated honestly).** Naviio does not yet operate a multi-person 24/7 on-call rotation. At the company's current size, on-call is a **single-responder** arrangement: production and security alerts page the Incident Response Lead directly via PagerDuty, who is reachable outside business hours. A rotating multi-responder schedule with a documented secondary/escalation responder will be established as the engineering team grows; until then, the External IR Firm row above is the planned escalation path for incidents beyond internal capacity.

---

## 4. Detection Methods

Naviio employs multiple detection layers to identify security incidents:

### 4.1 Automated Detection
| Source | What It Detects |
|---|---|
| **AWS CloudTrail** | Unauthorized API calls, unusual IAM activity, configuration changes |
| **AWS GuardDuty** | Threat intelligence-based anomaly detection (port scanning, unusual data access patterns, known malicious IPs) |
| **AWS WAF Logs** | Injection attempts, rate limit violations, unusual geographic traffic |
| **RDS Audit Logs** | Unexpected database queries, bulk data exports, access from unusual hosts |
| **Application Error Monitoring** | Spike in 401/403 errors (credential stuffing), unexpected API call patterns |
| **GitHub Secret Scanning** | Accidental credential commits to source code |
| **Dependabot Alerts** | Known CVEs in production dependencies |

### 4.2 Manual Detection
- Customer reports of unauthorized account activity
- Employee reports of phishing, suspicious email, or unusual system behavior
- Plaid, Stripe, or other vendor security notifications
- Third-party penetration test findings
- Routine security log reviews (quarterly)

### 4.3 Reporting
Any employee, contractor, or customer who suspects a security incident must immediately notify Eric Franco via:
- Email: francoeric34@gmail.com (subject line: `[SECURITY INCIDENT]`)
- Phone/text for P0/P1 situations

---

## 5. Response Procedures

### Phase 1: Identification and Triage (0–2 hours for P0)

1. **Acknowledge the report** — Confirm receipt to the reporter within 30 minutes.
2. **Create an incident record** — Log the incident in a private, secure channel (not in a public Slack channel). Record: time detected, source of detection, systems potentially affected, initial severity classification.
3. **Perform initial triage** — Determine: Is this a true positive? What systems are involved? Is the incident ongoing? What data may be affected?
4. **Escalate if needed** — For P0/P1, immediately notify the full Incident Response Team. Do not wait for full investigation before escalating.
5. **Preserve evidence** — Before taking containment actions, capture relevant logs, screenshots, and system state to support forensic investigation. Do not alter or delete logs.

### Phase 2: Containment (2–6 hours for P0)

Containment actions depend on the nature of the incident. Typical actions include:

| Incident Type | Containment Action |
|---|---|
| Compromised employee credentials | Immediately revoke all sessions and API tokens; reset credentials; enable additional MFA enforcement |
| Unauthorized DB access | Revoke compromised DB credentials; rotate to new credentials; review and restrict security group rules |
| Compromised OAuth token (Plaid, Stripe, etc.) | Revoke the token via provider API immediately; notify the affected customer |
| Active data exfiltration | Block the source IP at the WAF; revoke associated credentials; isolate affected EC2 instance if necessary |
| Ransomware / host compromise | Isolate the affected instance from the VPC; restore from last clean backup; do not pay ransom without legal counsel |
| Dependency exploit (supply chain) | Block affected code path; deploy hotfix; roll back if necessary |

> **Rule**: Containment does not preclude notification. Begin user notification procedures in parallel with containment for P0/P1 incidents — do not wait for full remediation before telling affected customers.

### Phase 3: Investigation and Eradication (parallel with containment)

1. **Determine the root cause** — What vulnerability or misconfiguration was exploited? What was the initial point of entry?
2. **Scope the impact** — Which customer accounts were affected? What data was potentially accessed or exfiltrated? Over what time period?
3. **Identify indicators of compromise (IOCs)** — IP addresses, user agents, query patterns, malicious code — to ensure full eradication.
4. **Eradicate the threat** — Patch the vulnerability; remove malicious code; rotate all potentially compromised credentials; rebuild compromised instances from clean AMIs.
5. **Verify eradication** — Confirm the attack vector is closed before restoring production traffic.

### Phase 4: Recovery

1. Restore affected systems from the last verified clean state (RDS snapshot, clean EC2 AMI).
2. Verify data integrity post-restoration.
3. Gradually restore production traffic with enhanced monitoring.
4. Confirm affected customers that their accounts are secured.
5. Monitor for recurrence for at least 72 hours post-recovery.

---

## 6. Notification Procedures

### 6.1 Customer Notification

**Trigger**: Any P0 or P1 incident with confirmed or reasonably suspected exposure of customer financial data.

**Timeline**: Customers are notified within **72 hours** of the incident being confirmed — not 72 hours from initial detection, but from the point at which Naviio has reasonable certainty that an incident occurred and what data was affected.

**Notification content** (minimum required):
- What happened (in plain language)
- When it happened (date range)
- What data was affected (specific to the customer's data where possible)
- What Naviio has done to contain and remediate
- What the customer should do (e.g., revoke and reconnect integrations, change passwords)
- Who to contact at Naviio with questions

**Channel**: Email to the account owner's registered email address. For high-severity incidents, a direct phone call is made where contact information is available.

**Draft notifications are reviewed by legal counsel** (or Eric Franco where counsel is not yet retained) before sending. Notifications are not delayed waiting for a full investigation to complete — we notify with what we know and provide updates.

### 6.2 Plaid Notification

**Trigger**: Any incident involving data connected via a Plaid integration — whether it involves a Plaid access token compromise, unauthorized access to Plaid-sourced data, or any breach of systems that store Plaid access tokens.

**Timeline**: Plaid is notified within **24 hours** of incident confirmation, per our Plaid Developer Agreement.

**Procedure**:
1. Eric Franco contacts Plaid's security team via the dedicated developer security email (security@plaid.com or per the current Developer Agreement contact).
2. Notification includes: incident description, date range, impacted Plaid items/access tokens, containment actions taken.
3. Naviio revokes any affected Plaid access tokens via `/item/remove` as part of containment, regardless of whether the customer has been notified yet.
4. Naviio cooperates fully with any Plaid security investigation.

### 6.3 Other Third-Party Notification

| Vendor | Trigger | Contact |
|---|---|---|
| **Stripe** | Compromise of Stripe OAuth tokens or Stripe-sourced data | Stripe's security contact via Dashboard or stripe.com/contact/security |
| **Intuit (QuickBooks)** | Compromise of QuickBooks OAuth tokens | Intuit security team per developer agreement |
| **AWS** | Suspected compromise of AWS account or EC2/RDS instances | AWS Trust & Safety via AWS Support Console |

### 6.4 Regulatory Notification

Naviio is not currently subject to specific financial data breach notification regulations (e.g., we are not a bank or broker-dealer). However:

- If customer data involves EU residents' personal data, **GDPR Article 33** requires supervisory authority notification within **72 hours** of discovery.
- If customer data involves California residents, **CCPA breach notification** may apply for certain categories of personal information.
- Outside counsel is consulted for any P0 incident to determine applicable notification requirements before customer notifications are sent.

---

## 7. Communication Guidelines During an Incident

- **Do not** discuss the incident in public Slack channels, social media, or any external forum.
- **Do not** speculate about the cause or scope to customers before the investigation is complete.
- **Do not** send customer notifications without review by Eric Franco (and legal counsel for P0/P1).
- All internal communications about the incident should be in a private, designated channel (e.g., a private Slack channel titled `#incident-YYYY-MM-DD-description`).
- External communications (customer emails, press) are drafted by Eric Franco and reviewed by counsel.

---

## 8. Post-Incident Review

A **blameless postmortem** is conducted within **5 business days** of all P0 and P1 incidents, and within **10 business days** of P2 incidents.

### Postmortem Template

```
Incident ID:
Date/Time of Detection:
Date/Time of Containment:
Date/Time of Recovery:
Severity:

Timeline (chronological):
  - [timestamp] — event

Root Cause:

Impact:
  - Customers affected:
  - Data categories affected:
  - Duration:

What went well:

What didn't go well:

Action items:
  | Action | Owner | Due Date |
  |--------|-------|----------|
```

Postmortems are stored in a private internal document (not in a public repository). Action items are tracked to completion.

### Key Metrics Tracked
- **Mean Time to Detect (MTTD)**: Time from incident start to detection
- **Mean Time to Contain (MTTC)**: Time from detection to containment
- **Mean Time to Recover (MTTR)**: Time from detection to full service restoration
- **Notification latency**: Time from confirmation to first customer notification

---

## 9. Testing and Drills

- The Incident Response Plan is reviewed and updated annually (or following a real incident).
- A **tabletop exercise** simulating a P0 data breach scenario is conducted annually. Participants: Eric Franco and any engineering staff.
- Detection tooling (GuardDuty alerts, WAF alarms, on-call paging) is tested quarterly.

---

## 10. Incident Log

All security incidents (P0–P3) are logged in a private incident register with the following fields:

| Field | Description |
|---|---|
| Incident ID | Sequential identifier (e.g., INC-2026-001) |
| Date detected | ISO 8601 date/time |
| Date confirmed | ISO 8601 date/time |
| Date resolved | ISO 8601 date/time |
| Severity | P0/P1/P2/P3 |
| Description | Summary of incident |
| Root cause | Brief root cause description |
| Data affected | Categories and estimated scope |
| Customers notified | Yes/No; date if yes |
| Plaid notified | Yes/No/N/A; date if yes |
| Regulatory notification | Yes/No/N/A; details if yes |
| Postmortem link | Link to postmortem document |

The incident log is accessible only to the CEO and legal counsel.

---

*Naviio, Inc. | docs/security/incident-response-plan.md | v1.0 | June 2026*
