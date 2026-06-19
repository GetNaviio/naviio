/**
 * Firm platform-subscription webhook. Keeps Firm.subscriptionStatus in sync with
 * the firm's Stripe subscription so the UI reflects cancellations / past-due.
 *
 *   customer.subscription.updated  → mirror sub.status (active | past_due | …)
 *   customer.subscription.deleted  → 'canceled'
 *
 * Signature-verified with STRIPE_FIRM_WEBHOOK_SECRET (falls back to
 * STRIPE_WEBHOOK_SECRET). These are events on Naviio's own account.
 */
import type Stripe from 'stripe'
import { constructFirmBillingEvent } from '@/lib/firm/stripe-billing'
import { setSubscriptionStatusBySubId } from '@/lib/firm/billing-store'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'no signature' }, { status: 400 })

  const body = await request.text()
  let event: Stripe.Event
  try {
    event = constructFirmBillingEvent(body, signature)
  } catch (err) {
    console.error('firm billing webhook signature verification failed:', err)
    return Response.json({ error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status
    try {
      await setSubscriptionStatusBySubId(sub.id, status)
    } catch (err) {
      console.error('firm billing webhook update failed:', err)
      return Response.json({ error: 'update failed' }, { status: 500 })
    }
  }

  return Response.json({ received: true })
}
