/**
 * Stripe wiring for individual (per-org) plan subscriptions. The org pays Naviio
 * directly for Starter/Growth/Pro/CFO. Mirrors the firm-billing flow but as flat
 * plan prices. Env-gated on STRIPE_SECRET_KEY; price IDs from
 * scripts/stripe-plan-prices.cjs.
 */
import Stripe from 'stripe'
import type { Plan } from '@prisma/client'
import type { BillingCycle } from '@/lib/billing/plans'

export function isPlanBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

// Self-serve plans only. CFO Suite is sold via the fractional-CFO firm plans
// (lib/firm/*), so it has no individual price here — avoids a duplicate $799 SKU.
const PLAN_IDS: Plan[] = ['STARTER', 'GROWTH', 'PRO', 'CFO']

/** Env var name for a plan/cycle price, e.g. STRIPE_PLAN_PRICE_GROWTH_ANNUAL. */
function envName(plan: Plan, cycle: BillingCycle): string {
  return `STRIPE_PLAN_PRICE_${plan}_${cycle.toUpperCase()}`
}

export function priceIdForPlan(plan: Plan, cycle: BillingCycle): string | null {
  return process.env[envName(plan, cycle)] || null
}

export function arePlanPricesConfigured(): boolean {
  return PLAN_IDS.every((p) => priceIdForPlan(p, 'monthly') && priceIdForPlan(p, 'annual'))
}

/** Reverse-map a Stripe price id back to a Plan (for webhook updates). */
export function planFromPriceId(priceId: string): Plan | null {
  for (const p of PLAN_IDS) {
    if (process.env[envName(p, 'monthly')] === priceId || process.env[envName(p, 'annual')] === priceId) return p
  }
  return null
}

/** Checkout (subscription mode) for an org upgrading/subscribing to a plan.
 *  `entities` sets the quantity for multi-entity (Pro/CFO graduated) prices. */
export async function createPlanCheckout(input: {
  orgId: string
  plan: Plan
  cycle: BillingCycle
  customerId: string | null
  origin: string
  entities?: number
}): Promise<string> {
  const price = priceIdForPlan(input.plan, input.cycle)
  if (!price) throw new Error('plan price not configured')
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: Math.max(1, input.entities ?? 1) }],
    customer: input.customerId ?? undefined,
    client_reference_id: input.orgId,
    metadata: { orgId: input.orgId, plan: input.plan, cycle: input.cycle },
    subscription_data: { metadata: { orgId: input.orgId, plan: input.plan } },
    success_url: `${input.origin}/settings?billing=plan&session_id={CHECKOUT_SESSION_ID}#billing`,
    cancel_url: `${input.origin}/settings?billing=cancel#billing`,
  })
  if (!session.url) throw new Error('no checkout url')
  return session.url
}

export async function confirmPlanCheckout(
  sessionId: string,
): Promise<{ orgId: string; plan: Plan; customerId: string; subscriptionId: string } | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId)
  const orgId = session.metadata?.orgId
  const plan = session.metadata?.plan as Plan | undefined
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (session.status !== 'complete' || !orgId || !plan || !customerId || !subscriptionId) return null
  return { orgId, plan, customerId, subscriptionId }
}

/** Verify + parse a plan-billing webhook. Falls back to STRIPE_WEBHOOK_SECRET. */
export function constructPlanBillingEvent(body: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_PLAN_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || ''
  return stripe().webhooks.constructEvent(body, signature, secret)
}

/** The plan a subscription currently maps to, via its first item's price id. */
export function planOfSubscription(sub: Stripe.Subscription): Plan | null {
  const priceId = sub.items?.data?.[0]?.price?.id
  return priceId ? planFromPriceId(priceId) : null
}

/** Keep the plan subscription quantity (= entity count) in sync with the roster. */
export async function syncPlanSubscriptionQuantity(subscriptionId: string, entities: number): Promise<void> {
  const s = stripe()
  const sub = await s.subscriptions.retrieve(subscriptionId)
  const item = sub.items.data[0]
  if (!item) return
  const qty = Math.max(1, entities)
  if (item.quantity === qty) return
  await s.subscriptionItems.update(item.id, { quantity: qty, proration_behavior: 'create_prorations' })
}
