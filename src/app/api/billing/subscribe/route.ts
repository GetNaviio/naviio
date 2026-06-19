/**
 * Subscribe / upgrade the current org to a plan (Starter/Growth/Pro/CFO). Returns
 * a Stripe Checkout URL; /api/billing/confirm persists the result on return.
 * Owner-only — billing is a control-plane action.
 */
import { z } from 'zod'
import { withOwner } from '@/lib/api/with-org'
import { getOrgBilling, countOwnedOrgs, getOwnerBillingOrg } from '@/lib/billing/org-billing-store'
import { planAllowsMultiEntity } from '@/lib/billing/plans'
import { isPlanBillingConfigured, priceIdForPlan, createPlanCheckout } from '@/lib/billing/stripe-plans'

const Schema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'PRO', 'CFO']),
  cycle: z.enum(['monthly', 'annual']).default('monthly'),
})

export const POST = withOwner(async (request, { user, orgId }) => {
  if (!isPlanBillingConfigured()) return Response.json({ error: 'Billing is not configured on this server.' }, { status: 503 })
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid plan' }, { status: 400 })
  if (!priceIdForPlan(parsed.data.plan, parsed.data.cycle))
    return Response.json({ error: 'Pricing is not configured for this plan yet.' }, { status: 503 })

  // One plan subscription per owner. Bill on the existing anchor org if there is
  // one (a switch/upgrade), otherwise the active org.
  const anchor = await getOwnerBillingOrg(user.id)
  const billOrgId = anchor?.orgId ?? orgId
  const billing = await getOrgBilling(billOrgId)
  // Multi-entity plans bill quantity = the owner's entity (owned-org) count.
  const entities = planAllowsMultiEntity(parsed.data.plan) ? await countOwnedOrgs(user.id) : 1

  try {
    const url = await createPlanCheckout({
      orgId: billOrgId,
      plan: parsed.data.plan,
      cycle: parsed.data.cycle,
      customerId: billing?.stripeCustomerId ?? anchor?.customerId ?? null,
      entities,
      origin: new URL(request.url).origin,
    })
    return Response.json({ url })
  } catch (e) {
    console.error('plan checkout failed:', e)
    return Response.json({ error: 'Could not start checkout.' }, { status: 502 })
  }
})
