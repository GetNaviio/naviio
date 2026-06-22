/**
 * Billing summary for the current org's plan subscription (Settings → Billing),
 * including the owner's entity (owned-org) count and the cheaper multi-entity plan.
 */
import { withOrg } from '@/lib/api/with-org'
import { getOrgRole } from '@/lib/org'
import { isFirmUser } from '@/lib/firm/firm'
import { getOrgBilling, countOwnedOrgs, getOwnerBillingOrg } from '@/lib/billing/org-billing-store'
import { SELF_SERVE_PLANS, PLAN_BY_ID, cheaperPlanForEntities, planCostForEntities } from '@/lib/billing/plans'
import {
  isPlanBillingConfigured,
  arePlanPricesConfigured,
  syncPlanSubscriptionQuantity,
} from '@/lib/billing/stripe-plans'

export const GET = withOrg(async (_request, { user, orgId }) => {
  const [billing, isOwnerRole, entityCount, anchor, isFirm] = await Promise.all([
    getOrgBilling(orgId),
    getOrgRole(orgId, user.id),
    countOwnedOrgs(user.id),
    getOwnerBillingOrg(user.id),
    isFirmUser(user.id),
  ])
  const isOwner = isOwnerRole === 'OWNER'
  // The displayed plan is the owner's billing-anchor (subscription) plan — the
  // single source of truth — so switching into a freshly-created entity (whose
  // own `plan` column may differ) never misreports the plan.
  const current = anchor?.plan ?? billing?.plan ?? 'STARTER'

  // Keep the subscription quantity (= entity count) current as the roster changes.
  if (anchor?.subscriptionId && isPlanBillingConfigured()) {
    await syncPlanSubscriptionQuantity(anchor.subscriptionId, entityCount).catch(() => {})
  }

  return Response.json({
    plans: SELF_SERVE_PLANS.map((p) => ({
      id: p.id,
      label: p.label,
      monthlyCents: p.monthlyCents,
      annualCents: p.annualCents,
      seats: Number.isFinite(p.seats) ? p.seats : null,
      includedEntities: p.includedEntities,
      entityOverageCents: p.entityOverageCents,
      blurb: p.blurb,
    })),
    currentPlan: current,
    currentPlanLabel: PLAN_BY_ID[current]?.label ?? current,
    entityCount,
    // The cheaper of Pro / CFO Suite at the current entity count (crossover at 8).
    recommendedPlan: cheaperPlanForEntities(entityCount),
    // Current bill at this entity count, on the current plan.
    currentBillCents: planCostForEntities(current, entityCount),
    subscriptionStatus: billing?.subscriptionStatus ?? 'none',
    isOwner,
    isFirm,
    billingConfigured: isPlanBillingConfigured(),
    pricesConfigured: arePlanPricesConfigured(),
  })
})
