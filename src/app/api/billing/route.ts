/**
 * Billing summary for the current org's plan subscription (Settings → Billing).
 */
import { withOrg } from '@/lib/api/with-org'
import { getOrgRole } from '@/lib/org'
import { getOrgBilling } from '@/lib/billing/org-billing-store'
import { PLAN_PRICING } from '@/lib/billing/plans'
import { isPlanBillingConfigured, arePlanPricesConfigured } from '@/lib/billing/stripe-plans'

export const GET = withOrg(async (_request, { user, orgId }) => {
  const billing = await getOrgBilling(orgId)
  const isOwner = (await getOrgRole(orgId, user.id)) === 'OWNER'
  return Response.json({
    plans: PLAN_PRICING.map((p) => ({
      id: p.id,
      label: p.label,
      monthlyCents: p.monthlyCents,
      annualCents: p.annualCents,
      seats: Number.isFinite(p.seats) ? p.seats : null,
      blurb: p.blurb,
    })),
    currentPlan: billing?.plan ?? 'STARTER',
    subscriptionStatus: billing?.subscriptionStatus ?? 'none',
    isOwner,
    billingConfigured: isPlanBillingConfigured(),
    pricesConfigured: arePlanPricesConfigured(),
  })
})
