# 0054 — Pricing architecture (individual, multi-entity, and firm)

**Status:** accepted · **Date:** 2026-06-19
**Supersedes/links:** 0053 (firm billing plans). Complements 0052 (advisor access).

## Context

Naviio monetizes three distinct customer shapes. They were built incrementally and
this doc is the single source of truth tying them together, so the pricing stops
being scattered across commits.

1. **Solo / single business** — one company, one set of books.
2. **Multi-entity business** — one customer with several of *their own* legal
   entities or locations (HoldCo + OpCos, a 6-location restaurant group).
3. **Fractional CFO / accounting firm** — manages many *separate client*
   businesses (white-label, advisor access, optional resale).

## Decision — three surfaces, one Plan enum + a separate Firm

### A. Individual plans (Settings → Billing) — `lib/billing/*`

Self-serve, billed per org to the org owner. Canonical numbers in
`lib/billing/plans.ts`; flat or graduated Stripe prices from
`scripts/stripe-plan-prices.cjs`.

| Plan | Price/mo | Entities | Seats |
|---|---|---|---|
| Starter | $49 | 1 | 1 |
| Growth | $149 | 1 | 3 |
| Pro | $349 | **3, then $99/entity** | 10 |
| CFO Suite | $799 | **10, then $99/entity** | unlimited |

- **Multi-entity = a user owning multiple orgs.** Gated to **Pro+** (Starter/Growth
  are single-entity). Pro and CFO Suite are **graduated tiered** Stripe prices keyed
  on the subscription **quantity = entity (owned-org) count**: a flat base covers the
  included entities, then $99/entity.
- **No cliff.** Pro carries the overage, so a 4-entity business pays $448 (not a jump
  to $799). The app recommends the cheaper of Pro vs CFO at the current count — the
  crossover is **8 entities** ($349 + 5×$99 = $844 > $799) — and offers "Switch & save".
- Annual = pay for 10 months (2 months free), applied to base and overage.
- Webhook `customer.subscription.updated/deleted` keeps `Organization.plan` +
  `subscriptionStatus` in sync (`/api/billing/webhook`).

### B. Fractional-CFO firm plans (Clients page) — `lib/firm/*`

Separate from the Plan enum; a `Firm` groups client orgs. Decision 0053 has the
detail. Summary:

| Plan | Price/mo | Client orgs | Naviio take |
|---|---|---|---|
| White-label | $799 | 10, then **$59/org** | base + overage |
| White-label + SaaS resale | $997 | 25, then $59/org | base + **15% commission** via Stripe Connect |

### C. Credits — `lib/credits/*`

Metered usage packs (Navi messages, syncs), orthogonal to plans. Unchanged.

## Why the $799 appears twice but isn't a duplicate

CFO Suite (individual, multi-entity) and the firm White-label plan share the **$799
base + 10 included** anchor but are genuinely different SKUs:

- **CFO Suite (retail):** one business's *own* entities → **$99/entity** overage.
- **Firm White-label (channel):** a CFO's *clients* → **$59/org** overage + resale.

The firm gets the better marginal rate **on purpose** — they're the distribution
channel (they bring volume and resell), so they beat the retail per-entity price.
We tell them apart in the data: a firm comes through the Clients/firm onboarding
(it has a `Firm` record + advisor memberships); a multi-entity business is just one
owner holding several of their own orgs.

The marketing page reflects this: Starter/Growth/Pro are self-serve tiles; the 4th
tile is "For fractional CFOs" ($799, or $997 to resell) with a "Talk to us" CTA.
CFO Suite (direct multi-entity) is discovered via the in-app upgrade nudge when a
business outgrows Pro's 3 entities.

## Implementation map

- Individual: `lib/billing/plans.ts`, `org-billing-store.ts`, `stripe-plans.ts`;
  routes `/api/billing`, `/subscribe`, `/confirm`, `/webhook`; `PlanSection`;
  `scripts/stripe-plan-prices.cjs`. Entity creation gated in `/api/org/create`
  (Pro+), `canCreate` in `/api/org/switch`.
- Firm: `lib/firm/*`; routes `/api/firm/*`; `BillingSection`;
  `scripts/stripe-firm-prices.cjs`. (0053.)
- Schema (raw SQL, no Prisma regen needed): `Organization.subscriptionStatus`
  (`20260619004000`), `Firm` billing columns + `subscriptionStatus`
  (`20260619001000`, `_003000`).

## Setup checklist (per Stripe mode — test, then live)

1. `node scripts/stripe-plan-prices.cjs` → set 8 `STRIPE_PLAN_PRICE_*` (Starter/Growth
   flat; Pro/CFO graduated entity-tiered).
2. `node scripts/stripe-firm-prices.cjs` → set 4 `STRIPE_FIRM_PRICE_*`.
3. Enable **Stripe Connect** (firm SaaS resale).
4. Webhooks: `/api/billing/webhook` + `/api/firm/billing/webhook` (Your account,
   `customer.subscription.updated/deleted`); `/api/firm/connect/webhook` (Connected
   accounts, `account.updated`). Set the matching `*_WEBHOOK_SECRET`s.

## Open / future

- Volume breaks above ~10 entities (where retail multi-entity nears firm pricing) —
  route to a custom/enterprise rate.
- Proration tuning on quantity changes; dunning/past-due UX beyond the status badge.
