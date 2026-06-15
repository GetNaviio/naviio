import { withOrg } from '@/lib/api/with-org'
import { createCreditCheckout } from '@/lib/credits/checkout'

/**
 * Start a credit-reload purchase. Returns a Stripe Checkout URL for the client
 * to redirect to. Defaults to the single 'reload' pack.
 */
export const POST = withOrg(async (request, { orgId }) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Billing is not configured (no STRIPE_SECRET_KEY).' }, { status: 503 })
  }

  const { packId, returnPath } = await request.json().catch(() => ({}))
  const origin = new URL(request.url).origin
  try {
    const url = await createCreditCheckout(
      orgId,
      typeof packId === 'string' ? packId : 'reload',
      origin,
      typeof returnPath === 'string' ? returnPath : '/dashboard',
    )
    return Response.json({ url })
  } catch (err) {
    console.error('credits checkout failed:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'checkout_failed' }, { status: 500 })
  }
})
