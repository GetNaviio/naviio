/**
 * Confirm a returned plan Checkout session and apply the plan to the org
 * (webhook-independent path). Only applies to the caller's active org.
 */
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { setOrgPlanActive, countOwnedOrgs } from '@/lib/billing/org-billing-store'
import { planAllowsMultiEntity } from '@/lib/billing/plans'
import { confirmPlanCheckout, syncPlanSubscriptionQuantity } from '@/lib/billing/stripe-plans'

// withAuth (not withOrg): the Checkout was anchored on the owner's billing org,
// which may differ from the currently active org. We verify ownership directly.
export const GET = withAuth(async (request, { user }) => {
  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'session_id required' }, { status: 400 })
  try {
    const result = await confirmPlanCheckout(sessionId)
    if (!result) return Response.json({ ok: false })
    // The anchored org must belong to this user.
    const owned = await prisma.organization.findFirst({ where: { id: result.orgId, userId: user.id }, select: { id: true } })
    if (!owned) return Response.json({ ok: false })

    await setOrgPlanActive(result.orgId, result.plan, result.customerId, result.subscriptionId)
    if (planAllowsMultiEntity(result.plan)) {
      await syncPlanSubscriptionQuantity(result.subscriptionId, await countOwnedOrgs(user.id)).catch(() => {})
    }
    return Response.json({ ok: true, plan: result.plan })
  } catch (e) {
    console.error('plan confirm failed:', e)
    return Response.json({ ok: false }, { status: 502 })
  }
})
