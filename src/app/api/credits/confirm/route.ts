import { withOrg } from '@/lib/api/with-org'
import { confirmCreditSession } from '@/lib/credits/checkout'

/**
 * Confirm a Stripe Checkout session on return and grant credits if paid.
 * Webhook-independent (idempotent) — the client calls this when it lands back
 * on the dashboard with ?session_id=...
 */
export const POST = withOrg(async (request, { orgId }) => {
  const { sessionId } = await request.json().catch(() => ({}))
  if (!sessionId || typeof sessionId !== 'string') {
    return Response.json({ error: 'sessionId required' }, { status: 400 })
  }
  try {
    const result = await confirmCreditSession(orgId, sessionId)
    return Response.json(result)
  } catch (err) {
    console.error('credits confirm failed:', err)
    return Response.json({ error: 'confirm_failed' }, { status: 500 })
  }
})
