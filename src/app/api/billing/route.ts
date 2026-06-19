/**
 * Billing summary for the current org's plan subscription (Settings → Billing).
 */
import { withOrg } from '@/lib/api/with-org'
import { getOrgRole } from '@/lib/org'
import { getOrgBilling } from '@/lib/billing/org-billing-store'
import { SELF_SERVE_PLANS, PLAN_BY_ID } from '@/lib/billing/plans'
import { isPlanBillingConfigured, arePlanPricesConfigured } from '@/lib/billing/stripe-plans'

export const GET = withOrg(async (_request, { user, orgId }) => {
  const billing = await getOrgBilling(orgId)
  const isOwner = (await getOrgRole(orgId, user.id)) === 'OWNER'
  const current = billing?.plan ?? 'STARTER'
  return Response.json({
    plans: SELF_SERVE_PLANS.map((p) => ({
      id: p.id,
      label: p.label,
      monthlyCents: p.monthlyCents,
      annualCents: p.annualCents,
      seats: Number.isFinite(p.seats) ? p.seats : null,
      blurb: p.blurb,
    })),
    currentPlan: current,
    currentPlanLabel: PLAN_BY_ID[current]?.label ?? current,
    // True when the org is on the CFO/firm tier (managed via the Clients page).
    isFirmPlan: current === 'CFO',
    subscriptionStatus: billing?.subscriptionStatus ?? 'none',
    isOwner,
    billingConfigured: isPlanBillingConfigured(),
    pricesConfigured: arePlanPricesConfigured(),
  })
})
