/**
 * Start the firm's platform subscription (base + per-org overage). Returns a
 * Stripe Checkout URL; on return, /api/firm/billing/confirm persists the IDs.
 */
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner } from '@/lib/firm/firm'
import { getFirmBilling, countFirmOrgs } from '@/lib/firm/billing-store'
import { isBillingConfigured, priceIdFor, createFirmBillingCheckout } from '@/lib/firm/stripe-billing'
import type { FirmPlan, BillingCycle } from '@/lib/firm/billing'

export const POST = withAuth(async (request, { user }) => {
  if (!isBillingConfigured()) return Response.json({ error: 'Billing is not configured on this server.' }, { status: 503 })
  const firm = await getFirmForOwner(user.id)
  if (!firm) return Response.json({ error: 'Add a client first to create your firm.' }, { status: 404 })

  const billing = await getFirmBilling(firm.id)
  const plan = (billing?.plan ?? 'white_label') as FirmPlan
  const cycle = (billing?.billingCycle ?? 'monthly') as BillingCycle
  if (!priceIdFor(plan, cycle))
    return Response.json({ error: 'Pricing is not configured yet for this plan.' }, { status: 503 })

  const orgCount = await countFirmOrgs(firm.id)
  try {
    const url = await createFirmBillingCheckout({
      firmId: firm.id,
      plan,
      cycle,
      orgCount,
      customerId: billing?.stripeCustomerId ?? null,
      origin: new URL(request.url).origin,
    })
    return Response.json({ url })
  } catch (e) {
    console.error('firm billing checkout failed:', e)
    return Response.json({ error: 'Could not start checkout.' }, { status: 502 })
  }
})
