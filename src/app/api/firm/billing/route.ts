/**
 * Firm billing summary + plan selection.
 *   GET — current plan, both plan options, live org count, and the estimated
 *         platform bill (base + overage). Includes Connect status for Option 2.
 *   PUT { plan } — switch the firm's plan (creates the firm lazily if needed).
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner, getOrCreateFirm } from '@/lib/firm/firm'
import { getFirmBilling, setFirmPlan, countFirmOrgs } from '@/lib/firm/billing-store'
import { PLANS, computeFirmBill, type FirmPlan } from '@/lib/firm/billing'
import { isBillingConfigured } from '@/lib/firm/stripe-billing'

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
  return Response.json({
    firm: { id: firm.id, name: firm.name },
    plans,
    orgCount,
    current: billing,
    bill: computeFirmBill(plan, orgCount),
    connectStatus: billing?.connectStatus ?? 'none',
    billingConfigured: isBillingConfigured(),
  })
})

const SelectSchema = z.object({ plan: z.enum(['white_label', 'white_label_saas']) })

export const PUT = withAuth(async (request, { user }) => {
  const body = await request.json().catch(() => null)
  const parsed = SelectSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid plan' }, { status: 400 })

  const firm = await getOrCreateFirm(user.id, user.name ? `${user.name}'s Practice` : 'My Practice')
  await setFirmPlan(firm.id, parsed.data.plan)
  const orgCount = await countFirmOrgs(firm.id)
  return Response.json({ ok: true, plan: parsed.data.plan, bill: computeFirmBill(parsed.data.plan, orgCount) })
})
