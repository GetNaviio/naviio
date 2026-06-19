/**
 * Stripe Connect webhook. On `account.updated`, flips the firm's connectStatus to
 * 'enabled' once the connected account can take charges + payouts — so the firm
 * doesn't have to refresh manually. Signature-verified (STRIPE_CONNECT_WEBHOOK_SECRET,
 * falling back to STRIPE_WEBHOOK_SECRET).
 */
import type Stripe from 'stripe'
import { constructConnectEvent, statusOfAccount } from '@/lib/firm/stripe-billing'
import { setConnectStatusByAccount } from '@/lib/firm/billing-store'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'no signature' }, { status: 400 })

  const body = await request.text() // raw body required for signature verification
  let event: Stripe.Event
  try {
    event = constructConnectEvent(body, signature)
  } catch (err) {
    console.error('connect webhook signature verification failed:', err)
    return Response.json({ error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    try {
      await setConnectStatusByAccount(account.id, statusOfAccount(account))
    } catch (err) {
      console.error('connect webhook update failed:', err)
      return Response.json({ error: 'update failed' }, { status: 500 })
    }
  }

  return Response.json({ received: true })
}
