# 0053 — Firm billing plans (white-label vs. SaaS resale)

**Status:** accepted · **Date:** 2026-06-19

## Context

The fractional-CFO GTM (0052, `docs/strategy/fractional-cfo-gtm.md`) needed a
firm-level billing model. The founder defined two options and asked for the open
numbers to be set: the per-org overage (Option 1), and the included org count +
commission rate (Option 2).

## Decision

Two firm plans, canonical values in `src/lib/firm/billing.ts`:

| | Option 1 — `white_label` | Option 2 — `white_label_saas` |
|---|---|---|
| Base | **$799/mo** | **$997/mo** |
| Included client orgs | **10** | **25** |
| Overage / org | **$59/mo** | $59/mo (beyond 25) |
| Charges clients? | No (firm absorbs) | Yes (firm resells) |
| Naviio commission | — | **15%** of client payments |

### Why these numbers
- **$59/org overage:** marginal COGS per org is ~$5–15/mo (Plaid/infra; Navi LLM is
  metered separately as credits), so $59 is ~85%+ margin. It sits *below* the implied
  base rate ($799/10 = $79.90) on purpose — we want firms to pile every client in
  (more data, stickiness, denser benchmarks). Above ~$75 deters that.
- **25 included orgs (Option 2):** the money engine is the commission, not the seat
  count, so be generous on seats to maximize client count. 25 removes seat anxiety.
- **15% commission:** 10% under-monetizes (the firm bundles high-margin software into
  $2k–10k/mo engagements); 20% works but tightens firm margin and tempts leakage.
  15% is clearly fair. The Connect application-fee mechanism makes leakage impossible
  regardless, so this is a pure positioning choice.

## Billing architecture
- **Option 1:** one Stripe subscription billed to the firm — base + graduated per-org
  overage (quantity = active client orgs, tracked via the firm roster).
- **Option 2:** the firm is a **Stripe Connect** (Express) account. The $997 base is a
  direct subscription; each *client* subscription is created on the platform with
  `application_fee_percent = commissionPct` and `transfer_data.destination =` the
  firm's account — so the client pays, the firm receives 85%, and Naviio keeps 15%
  automatically. No reporting, no reconciliation, no leakage.

## Implementation
- Schema: billing columns on `Firm` (`plan`, `baseFeeCents`, `includedOrgs`,
  `overagePerOrgCents`, `commissionPct`, `stripe*`, `connectStatus`); migration
  `20260619001000_firm_billing` (raw SQL, no Prisma regen needed).
- `lib/firm/billing.ts` — pure pricing model (`computeFirmBill`, `commissionCents`,
  `monthlySplit`). Verified by a logic harness (10 cases pass).
- `lib/firm/billing-store.ts` — plan/usage persistence (raw SQL).
- `lib/firm/stripe-billing.ts` — Connect onboarding + the client-subscription
  application-fee params. Env-gated on `STRIPE_SECRET_KEY`.
- Routes: `/api/firm/billing` (GET summary / PUT select), `/api/firm/connect`
  (onboarding + status). UI: `BillingSection` on the Clients page.

## Follow-ups / what's not done
- The recurring platform subscription needs Stripe **Price IDs** for the base and
  overage line items; client subscriptions and the application-fee flow need
  **Stripe Connect enabled** on the platform account. Plan selection and entitlement
  (included orgs, overage, commission) are live now; live charging activates when
  those keys/capabilities are configured.
- Optional later: an annual option, and a Connect webhook to flip `connectStatus`
  to `enabled` automatically (currently refreshed on demand via GET `/api/firm/connect`).
