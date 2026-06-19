/**
 * Org plan-subscription webhook. Keeps Organization.plan + subscriptionStatus in
 * sync with the org's Stripe subscription.
 *
 *   customer.subscription.updated → mirror status; if the price changed, mirror plan
 *   customer.subscription.deleted → status 'canceled', plan reverts to STARTER
 *
 * Verified with STRIPE_PLAN_WEBHOOK_SECRET (falls back to STRIPE_WEBHOOK_SECRET).
 */
import type Stripe from 'stripe'
import { constructPlanBillingEvent, planOfSubscription } from '@/lib/billing/stripe-plans'
import { setOrgStatusBySubId, cancelOrgSubBySubId } from '@/lib/billing/org-billing-store'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'no signature' }, { status: 400 })

  const body = await request.text()
  let event: Stripe.Event
  try {
    event = constructPlanBillingEvent(body, signature)
  } catch (err) {
    console.error('plan webhook signature verification failed:', err)
    return Response.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      await cancelOrgSubBySubId(sub.id)
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const plan = planOfSubscription(sub) ?? undefined
      await setOrgStatusBySubId(sub.id, sub.status, plan)
    }
  } catch (err) {
    console.error('plan webhook update failed:', err)
    return Response.json({ error: 'update failed' }, { status: 500 })
  }

  return Response.json({ received: true })
}
