/**
 * Confirm a returned plan Checkout session and apply the plan to the org
 * (webhook-independent path). Only applies to the caller's active org.
 */
import { withOrg } from '@/lib/api/with-org'
import { setOrgPlanActive } from '@/lib/billing/org-billing-store'
import { confirmPlanCheckout } from '@/lib/billing/stripe-plans'

export const GET = withOrg(async (request, { orgId }) => {
  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'session_id required' }, { status: 400 })
  try {
    const result = await confirmPlanCheckout(sessionId)
    if (!result || result.orgId !== orgId) return Response.json({ ok: false })
    await setOrgPlanActive(orgId, result.plan, result.customerId, result.subscriptionId)
    return Response.json({ ok: true, plan: result.plan })
  } catch (e) {
    console.error('plan confirm failed:', e)
    return Response.json({ ok: false }, { status: 502 })
  }
})
