# Data Handling Procedures

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-PROC-001                       |
| **Version**      | 1.0                                |
| **Effective**    | June 1, 2026                       |
| **Owner**        | Eric Franco, CEO                   |
| **Next Review**  | June 1, 2027                       |
| **Status**       | Active                             |

---

## 1. Purpose

These procedures govern how Naviio collects, stores, accesses, retains, and deletes customer financial data. Naviio operates as a financial intelligence platform — we process sensitive business financial data on behalf of our customers and are committed to handling that data with care, transparency, and in strict accordance with our contractual and regulatory obligations.

---

## 2. Data We Collect

Naviio collects data through customer-authorized third-party integrations. We do not collect data without explicit customer authorization through the OAuth or API key connection flow.

### 2.1 Banking Data — via Plaid

| Data Element | Description | How Collected |
|---|---|---|
| Account information | Institution name, account name, account type, mask (last 4 digits) | Plaid `/accounts/get` |
| Account balances | Current and available balance per account | Plaid `/accounts/balance/get` |
| Transaction history | Date, amount, merchant name, category, account ID | Plaid `/transactions/get` |
| Item metadata | Item ID, institution ID, connection status | Plaid item management APIs |

**What we do not collect via Plaid:**
- Full account numbers (we store only masked values)
- Routing numbers
- Full debit/credit card numbers
- Online banking credentials (Plaid handles authentication; we never see usernames or passwords)

**Plaid-specific data use:**
All Plaid-sourced data is used exclusively to display financial insights back to the authenticated account owner. Plaid data is never shared with other customers, sold to third parties, used for marketing profiling, or used for any purpose other than providing the Naviio service to the customer who authorized the connection. This is consistent with Plaid's Developer Policy requirements.

### 2.2 Accounting Data — via QuickBooks / Xero

| Data Element | Description |
|---|---|
| Profit & Loss statements | Revenue, COGS, gross profit, operating expenses, EBITDA by period |
| Balance sheet data | Assets, liabilities, equity |
| Expense records | Vendor, amount, category, date |
| Invoice data | Invoice amount, status, customer (anonymized), date |
| Chart of accounts | Account names and types |

### 2.3 Revenue Data — via Stripe

| Data Element | Description |
|---|---|
| MRR / ARR | Calculated from active subscription data |
| Subscription metrics | New MRR, churned MRR, expansion MRR |
| Customer count | Total active subscribers |
| Charges and payouts | Transaction amounts and dates |
| Churn rate | Calculated from subscription cancellations |

We access Stripe in read-only mode. We do not access full card numbers, CVVs, or individual customer PII beyond what is necessary to calculate aggregate revenue metrics.

### 2.4 Payroll Data — via Gusto / ADP (when connected)

| Data Element | Description |
|---|---|
| Total payroll run amount | Gross payroll per period |
| Employer tax liability | Employer-side payroll taxes |

We do not access individual employee salary data, SSNs, or personal information.

### 2.5 Account and Profile Data

| Data Element | Source | Purpose |
|---|---|---|
| Email address | Registration | Authentication, notifications |
| Name | Registration | Account display |
| Company name | Registration | Account display, report labeling |
| Hashed password | Registration | Authentication (bcrypt, cost factor 12+) |
| Session tokens | Generated at login | Authenticated session management |

---

## 3. Data Storage

### 3.1 Primary Database
- **Technology**: AWS RDS PostgreSQL 16
- **Location**: AWS `us-east-1` (N. Virginia)
- **Encryption**: AES-256 at rest via AWS KMS; TLS 1.2+ in transit
- **Access**: Private VPC subnet. No public internet access. Application server connects via internal VPC endpoint.
- **Backups**: Automated daily snapshots, 7-day retention. Backups are encrypted with the same KMS key.

### 3.2 Cache Layer
- **Technology**: AWS ElastiCache Redis
- **Purpose**: Short-term caching of computed financial summaries (e.g., dashboard aggregates, MRR calculations). TTL of 15–60 minutes.
- **Data stored**: Serialized JSON of aggregated metrics. Raw transaction data is not cached.
- **Location**: Private VPC subnet; same region as primary database.

### 3.3 Report Storage
- **Technology**: AWS S3
- **Bucket**: `naviio-reports-prod` (private, versioning enabled)
- **Encryption**: SSE-S3 (AES-256)
- **Access**: Pre-signed URLs with 1-hour expiry are generated per-user. No public bucket access.

### 3.4 Integration Credentials
- OAuth access tokens and refresh tokens for Plaid, QuickBooks, Xero, Stripe, etc. are stored in the primary database with an additional application-layer encryption pass before persistence.
- API keys entered manually by customers are stored via AWS Secrets Manager.
- No integration credential is stored in plaintext anywhere in our systems.

### 3.5 Data Residency
All customer data is stored within the **United States** (AWS us-east-1). We do not transfer customer financial data outside the United States. AI analysis requests sent to Anthropic (Claude) contain only aggregated financial summaries — no raw transaction data, PII, or authentication credentials are included.

---

## 4. Who Has Access to Customer Data

Access to customer data is strictly controlled and limited to personnel with a legitimate business need.

| Role | Access Level | Scope |
|---|---|---|
| CEO / Engineering Lead (Eric Franco) | Full production access | Incident response, debugging, infrastructure management |
| Engineers (current contractors) | Read access to anonymized logs | Debugging application errors; no direct DB access by default |
| Customer Support | Application-level access only | Can view account status; cannot access raw financial records |
| Third-party vendors | Per integration scope | AWS: infrastructure only; Anthropic: aggregated summaries only |

**Principles:**
- **No Naviio employee accesses production customer data without a documented business reason** (incident, debugging, customer-reported issue).
- Direct database queries against production data require CEO approval and are logged.
- Customer financial data is never accessed for internal analytics, benchmarking, or product development without explicit customer consent.
- All production access events are logged in AWS CloudTrail and RDS audit logs, retained for 90 days.

---

## 5. Data Retention Policy

| Data Type | Retention Period | Rationale |
|---|---|---|
| Bank transaction records | 25 months from collection date | Enables 2-year trend analysis |
| Account balance snapshots | 25 months | Enables historical comparison |
| Accounting data (P&L, balance sheet) | 25 months | Financial planning and reporting |
| Revenue metrics (Stripe) | 25 months | Subscription trend analysis |
| User authentication logs | 12 months | Security audit trail |
| Application error logs | 90 days | Debugging and incident response |
| Deleted account data | 30 days post-deletion (then purged) | Grace period for accidental deletion |
| Backup snapshots | 7 days (rolling) | Operational recovery |
| Report PDFs (S3) | Until customer deletion request | Customer-controlled |

Data older than the retention period is purged via automated nightly jobs. Purge operations are logged.

---

## 6. Data Access by Customers

Customer data is accessible only to:
1. The authenticated user who connected the integration (account owner)
2. Additional users within the same organization account, where org-level access is configured

Naviio does not allow one customer to access another customer's data. Database queries are scoped by `orgId` and authenticated via session token. All API endpoints validate the authenticated user's organization membership before returning data.

---

## 7. User and Account Deletion

When a customer requests account deletion (via in-app settings or written request to support):

### Immediate (within 24 hours):
- User authentication sessions are invalidated
- OAuth tokens for all connected integrations are revoked via the respective provider APIs (Plaid item removal, Stripe deauthorization, QuickBooks token revocation)
- User account is flagged as `deleted` in the database

### Within 30 days:
- All financial data associated with the account (transactions, balances, accounting records, revenue metrics) is permanently deleted from the primary database
- All report PDFs associated with the account are deleted from S3
- Cache entries are expired/evicted

### Within 90 days:
- Account records are removed from backup snapshots as backups rotate
- Anonymized aggregate data derived from the account (if any) is retained only if it cannot be re-linked to the individual account

### Confirmation:
- Customers receive an email confirmation when deletion is complete (within 30-day window)
- Deletion events are logged for regulatory compliance purposes

Deletion requests are processed by the CEO or a designated engineer. We do not charge for deletion requests and we do not require account holders to "re-authenticate through financial data providers" as a condition of deletion.

---

## 8. Plaid-Specific Data Handling

Naviio's use of Plaid-connected data is subject to [Plaid's Developer Policy](https://plaid.com/legal/) and our Plaid Developer Agreement. The following rules apply specifically to Plaid data:

| Rule | Implementation |
|---|---|
| **Use limitation** | Plaid data is used solely to provide financial insights to the customer who authorized the connection. It is never used for credit decisioning, sold, or shared with third parties. |
| **Display restriction** | Plaid data is displayed only to the authenticated user whose credentials were used to connect the account. It is never surfaced to other users without explicit re-authorization. |
| **No scraping** | Naviio does not perform credential-based screen scraping. All data is fetched via Plaid's official APIs. |
| **Token storage** | Plaid `access_token` and `item_id` are encrypted at the application layer before database persistence. |
| **Token revocation** | Upon account deletion or user-initiated disconnection, Naviio calls `/item/remove` to immediately invalidate the Plaid item. |
| **Data minimization** | We request only the Plaid Products required for the service: `transactions` and `auth`. We do not request `identity`, `income`, `assets`, or other products unless explicitly added to our product offering. |
| **Incident notification** | Any security incident involving Plaid-connected data is reported to Plaid within 24 hours per our Developer Agreement. |

---

## 9. Data Breach Notification

In the event of a confirmed data breach affecting customer financial data:

- Affected customers are notified within **72 hours** of confirmed discovery
- Notifications include: what data was affected, the timeframe, what we are doing, and steps customers can take
- Plaid is notified within **24 hours** per our Developer Agreement
- Regulatory notifications are made where required (see `incident-response-plan.md`)

---

## 10. Sub-processors

The following sub-processors may process customer data on our behalf:

| Sub-processor | Location | Data Processed | Agreement |
|---|---|---|---|
| Amazon Web Services (AWS) | USA | All customer data (infrastructure) | DPA in place |
| Plaid Technologies | USA | Bank connection tokens and data | Developer Agreement |
| Anthropic | USA | Aggregated financial summaries (AI analysis) | Terms of Service / DPA |
| Vercel | USA | Application code (no customer financial data) | DPA in place |
| SendGrid (Twilio) | USA | Email address, notification content | DPA in place |

---

*Naviio, Inc. | docs/security/data-handling-procedures.md | v1.0 | June 2026*
