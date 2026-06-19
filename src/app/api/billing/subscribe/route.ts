/**
 * Subscribe / upgrade the current org to a plan (Starter/Growth/Pro/CFO). Returns
 * a Stripe Checkout URL; /api/billing/confirm persists the result on return.
 * Owner-only — billing is a control-plane action.
 */
import { z } from 'zod'
import { withOwner } from '@/lib/api/with-org'
import { getOrgBilling } from '@/lib/billing/org-billing-store'
import { isPlanBillingConfigured, priceIdForPlan, createPlanCheckout } from '@/lib/billing/stripe-plans'

const Schema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'PRO', 'CFO']),
  cycle: z.enum(['monthly', 'annual']).default('monthly'),
})

export const POST = withOwner(async (request, { orgId }) => {
  if (!isPlanBillingConfigured()) return Response.json({ error: 'Billing is not configured on this server.' }, { status: 503 })
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid plan' }, { status: 400 })
  if (!priceIdForPlan(parsed.data.plan, parsed.data.cycle))
    return Response.json({ error: 'Pricing is not configured for this plan yet.' }, { status: 503 })

  const billing = await getOrgBilling(orgId)
  try {
    const url = await createPlanCheckout({
      orgId,
      plan: parsed.data.plan,
      cycle: parsed.data.cycle,
      customerId: billing?.stripeCustomerId ?? null,
      origin: new URL(request.url).origin,
    })
    return Response.json({ url })
  } catch (e) {
    console.error('plan checkout failed:', e)
    return Response.json({ error: 'Could not start checkout.' }, { status: 502 })
  }
})
