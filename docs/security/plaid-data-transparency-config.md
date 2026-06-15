# Plaid Data Transparency Messaging — Configuration

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | SEC-CFG-001                        |
| **Version**      | 1.0                                |
| **Effective**    | June 9, 2026                       |
| **Owner**        | Eric Franco, CEO                   |
| **Next Review**  | December 9, 2026                   |
| **Status**       | Active                             |

---

## 1. Purpose

Records the use-case descriptions and requested data scopes configured for Naviio in
Plaid's **Data Transparency Messaging** (the "Why is this needed?" consent pane shown on
the OAuth / Account Select panes). What appears here must match what Naviio actually
collects and uses, and must stay consistent with the published privacy policy (ATT-5) and
the diligence materials (`SEC-ATT-001`, `SEC-MAP-001`, `SEC-QRA-001`).

## 2. Use case descriptions (Plaid's fixed catalog — select up to 3)

Plaid's Data Transparency picker offers a **fixed catalog** (not free text). From the
"Personal / Business finance management" list, select only the options that are truthfully
what Naviio does. Naviio is a **read-only** B2B financial-intelligence dashboard
(P&L, cash flow, runway, KPIs) that integrates accounting data — it does not move money,
lend, invest, manage payroll/expense reports, or verify identity.

**Selected (2 of 3 — do not pad to 3 with inaccurate options):**
1. **Track and manage your finances** — core use case.
2. **Do business accounting and tax preparation** — B2B accounting integration (QBO/Xero)
   plus the CPA tax-estimate view. Caveat: Naviio provides tax *estimates*, not filing; this
   is the closest accurate business-accounting category.

**Deliberately NOT selected** (not what Naviio does): Prepare your taxes (consumer), Get
rewards, Invest your money, Prepare and categorize invoices, Manage employee expense
reporting, Track/manage/build your credit, Access your paycheck sooner, Pay down debt.

Both selected use cases are powered by the **Transactions** product alone, which reinforces
dropping Auth (§4).

## 3. Requested data scopes — keep minimal and truthful

| Consent-pane category | Plaid product | Naviio actually uses it? | Action |
|-----------------------|---------------|--------------------------|--------|
| Account and balance info | `transactions`, balances | **Yes** — `transactionsSync`, `accountsBalanceGet` power the P&L, cash flow, runway, and KPIs, across **depository AND credit-card accounts** | Keep |
| Account and routing numbers | `auth` | **No** — requested in the Link token (`src/lib/integrations/plaid.ts`) but no `authGet` call exists anywhere | **Remove** unless a payments/ACH feature is planned (see §4) |
| Contact info | `identity` | **No** — not requested in code and not used | Do not enable |

**Credit-card expenses are already covered.** Business credit-card balances and transactions
are returned by the **Transactions** product (no `account_filters` is set, so Link offers all
account types including credit). This requires **no new product and not Auth** — Auth is
account/routing numbers for bank payments and does not apply to reading card expenses.

**Per-category "why" justification (for the expandable rows):**
- *Account and balance info* — "Used to build your real-time profit & loss, cash flow, and
  runway from your actual bank and credit-card transaction and balance history."

**Accounting note (for accounting-specialist, not a Plaid config item):** when ingesting
credit-card transactions as expenses, ensure the bank→card payment is treated as a TRANSFER,
not a second expense, so business expenses are not double-counted.

## 3b. Account Select — view behavior

**Setting: "Enabled for multiple accounts."** The user explicitly selects which accounts to
link; Naviio receives data only from selected accounts. Chosen over "all accounts" because
user-selected consent is a stronger privacy/data-minimization posture, and over "one account"
because a business financial view needs the full set (checking, savings, credit card). For
OAuth banks with no subtype filters, Plaid hides this pane and account selection happens on the
bank's OAuth screen — same outcome. Accuracy depends on users connecting all business
accounts; nudge this in the in-app connect UI (product task, not a Plaid setting).

## 3c. Products intentionally NOT used

- **Income / Document Income (paystubs, W-2, 1099, bank-statement upload).** Not enabled and
  not configured. This is income-verification data for lending/underwriting/payroll — outside
  Naviio's read-only analytics use case. The Document Upload pane appears in the dashboard as
  an available customization but will never show in Naviio's flow because the Income product is
  not requested in the Link token. Leave disabled.
- **Identity (contact info), Auth (routing numbers).** See §3 — not used.

## 3d. Platform roadmap — web now, mobile app later

Naviio is **web-only today** (Next.js + `react-plaid-link`); the web Link + registered
`redirect_uri` are complete. A native mobile app is on the roadmap. When built:
- Likely **React Native** (`react-native-plaid-link-sdk`) for one iOS+Android codebase.
- Register **per-platform OAuth redirects** in the Plaid dashboard: iOS universal links
  (apple-app-site-association) and Android app links (package name + signing fingerprint),
  alongside the existing web redirect.
- **Security carries over:** the mobile app is a second "consumer-facing app where Link is
  deployed" under the Plaid MFA attestation (SEC-ATT-001 ATT-1). MFA enforcement and the
  Link-requires-MFA gate must be re-implemented on mobile before launch. Owner: security-legal.
- Leave the iOS/Android/React Native/Hosted Link onboarding items on the Plaid checklist as
  roadmap markers; do not mark complete until built.

## 4. Data minimization — Auth dropped ✅ (2026-06-09)

The Link token previously requested `products: [Products.Transactions, Products.Auth]`, but
**Auth was never used** (no `authGet` / routing-number code path). Requesting data the app
does not use is over-collection — it weakens the privacy posture and is exactly what
bank/Plaid diligence flags.

**Done:** `src/lib/integrations/plaid.ts` now requests `[Products.Transactions]` only
(transactions include balances, across depository AND credit-card accounts). Gates green
(eslint + tsc). The consent pane should no longer list "Account and routing numbers."
Re-add Auth only if a money-movement feature is built that actually calls `authGet`, and add
a matching use-case description before requesting it.

## 5. Consistency checklist before "Publish changes"

- [ ] Use-case descriptions match §2 and imply read-only analytics only.
- [ ] Requested data scopes match §3 (drop Auth unless payments are planned).
- [ ] Published privacy policy (`/privacy`) names Plaid and lists the same data categories.
- [ ] `SEC-QRA-001` privacy answer references the same scopes.

---

*Internal configuration record for Plaid Data Transparency Messaging. Owned by the
security-legal specialist; integration-code changes are made by the plaid-specialist.*
