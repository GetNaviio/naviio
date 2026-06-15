import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { createCreditCheckout } from '@/lib/credits/checkout'

/**
 * Start a credit-reload purchase. Returns a Stripe Checkout URL for the client
 * to redirect to. Defaults to the single 'reload' pack.
 */
export async function POST(request: Request) {
  let orgId: string
  try {
    const user = await requireAuth()
    orgId = await getDefaultOrgId(user.id)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Billing is not configured (no STRIPE_SECRET_KEY).' }, { status: 503 })
  }

  const { packId } = await request.json().catch(() => ({}))
  const origin = new URL(request.url).origin
  try {
    const url = await createCreditCheckout(orgId, typeof packId === 'string' ? packId : 'reload', origin)
    return Response.json({ url })
  } catch (err) {
    console.error('credits checkout failed:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'checkout_failed' }, { status: 500 })
  }
}
