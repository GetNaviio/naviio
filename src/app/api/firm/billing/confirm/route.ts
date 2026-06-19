/**
 * Confirm a returned firm-billing Checkout session and persist the customer +
 * subscription ids on the firm (webhook-independent path, mirrors credits).
 * Only persists for the firm owned by the caller.
 */
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner } from '@/lib/firm/firm'
import { setFirmStripeIds } from '@/lib/firm/billing-store'
import { confirmFirmCheckout } from '@/lib/firm/stripe-billing'

export const GET = withAuth(async (request, { user }) => {
  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'session_id required' }, { status: 400 })

  const firm = await getFirmForOwner(user.id)
  if (!firm) return Response.json({ ok: false }, { status: 404 })

  try {
    const result = await confirmFirmCheckout(sessionId)
    if (!result || result.firmId !== firm.id) return Response.json({ ok: false })
    await setFirmStripeIds(firm.id, result.customerId, result.subscriptionId)
    return Response.json({ ok: true })
  } catch (e) {
    console.error('firm billing confirm failed:', e)
    return Response.json({ ok: false }, { status: 502 })
  }
})
