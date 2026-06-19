/**
 * Firm billing summary + plan selection.
 *   GET — current plan, both plan options, live org count, and the estimated
 *         platform bill (base + overage). Includes Connect status for Option 2.
 *   PUT { plan } — switch the firm's plan (creates the firm lazily if needed).
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner, getOrCreateFirm } from '@/lib/firm/firm'
import { getFirmBilling, setFirmPlan, setFirmCycle, countFirmOrgs } from '@/lib/firm/billing-store'
import { PLANS, computeFirmBill, type FirmPlan, type BillingCycle } from '@/lib/firm/billing'
import { isBillingConfigured, arePricesConfigured, priceIdFor, syncFirmSubscriptionQuantity } from '@/lib/firm/stripe-billing'

export const GET = withAuth(async (_request, { user }) => {
  const firm = await getFirmForOwner(user.id)
  const plans = Object.values(PLANS)
  if (!firm) {
    return Response.json({
      firm: null,
      plans,
      orgCount: 0,
      current: null,
      bill: null,
      billingConfigured: isBillingConfigured(),
    })
  }
  const [billing, orgCount] = await Promise.all([getFirmBilling(firm.id), countFirmOrgs(firm.id)])
  const plan = (billing?.plan ?? 'white_label') as FirmPlan
  const cycle = (billing?.billingCycle ?? 'monthly') as BillingCycle

  // Keep the subscription quantity (= org count) current as the roster changes.
  if (billing?.stripeSubscriptionId && isBillingConfigured()) {
    await syncFirmSubscriptionQuantity(billing.stripeSubscriptionId, orgCount).catch(() => {})
  }

  return Response.json({
    firm: { id: firm.id, name: firm.name },
    plans,
    orgCount,
    current: billing,
    cycle,
    bill: computeFirmBill(plan, orgCount, cycle),
    connectStatus: billing?.connectStatus ?? 'none',
    billingConfigured: isBillingConfigured(),
    pricesConfigured: arePricesConfigured(),
    priceConfiguredForPlan: !!priceIdFor(plan, cycle),
    subscriptionActive: !!billing?.stripeSubscriptionId,
  })
})

const SelectSchema = z.object({
  plan: z.enum(['white_label', 'white_label_saas']).optional(),
  cycle: z.enum(['monthly', 'annual']).optional(),
})

export const PUT = withAuth(async (request, { user }) => {
  const body = await request.json().catch(() => null)
  const parsed = SelectSchema.safeParse(body)
  if (!parsed.success || (!parsed.data.plan && !parsed.data.cycle))
    return Response.json({ error: 'Provide a plan and/or cycle' }, { status: 400 })

  const firm = await getOrCreateFirm(user.id, user.name ? `${user.name}'s Practice` : 'My Practice')
  if (parsed.data.plan) await setFirmPlan(firm.id, parsed.data.plan)
  if (parsed.data.cycle) await setFirmCycle(firm.id, parsed.data.cycle)

  const billing = await getFirmBilling(firm.id)
  const plan = (parsed.data.plan ?? billing?.plan ?? 'white_label') as FirmPlan
  const cycle = (parsed.data.cycle ?? billing?.billingCycle ?? 'monthly') as BillingCycle
  const orgCount = await countFirmOrgs(firm.id)
  return Response.json({ ok: true, plan, cycle, bill: computeFirmBill(plan, orgCount, cycle) })
})
