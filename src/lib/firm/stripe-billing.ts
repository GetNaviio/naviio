/**
 * Stripe wiring for firm billing.
 *
 * Option 1 (white_label): the firm pays a platform subscription (base + per-org
 *   overage) — billed directly to the firm's Stripe customer.
 * Option 2 (white_label_saas): in addition, the firm becomes a Stripe Connect
 *   account; client subscriptions are created on the platform with an
 *   application fee = the firm's commissionPct, so Naviio keeps its cut and the
 *   firm receives the rest automatically (no reporting, no leakage).
 *
 * Env-gated: STRIPE_SECRET_KEY must be set (same as the rest of Stripe). Connect
 * onboarding additionally needs Connect enabled on the platform account.
 */
import Stripe from 'stripe'
import { getPlan, type FirmPlan, type BillingCycle } from '@/lib/firm/billing'

export function isBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

function platformStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

// ── Platform subscription (billing the firm: base + per-org overage) ──

const PRICE_ENV: Record<FirmPlan, Record<BillingCycle, string>> = {
  white_label: { monthly: 'STRIPE_FIRM_PRICE_WL_MONTHLY', annual: 'STRIPE_FIRM_PRICE_WL_ANNUAL' },
  white_label_saas: { monthly: 'STRIPE_FIRM_PRICE_WLSAAS_MONTHLY', annual: 'STRIPE_FIRM_PRICE_WLSAAS_ANNUAL' },
}

/** The Stripe Price id for a plan/cycle (from env, set by scripts/stripe-firm-prices.cjs). */
export function priceIdFor(plan: FirmPlan, cycle: BillingCycle): string | null {
  return process.env[PRICE_ENV[plan][cycle]] || null
}

export function arePricesConfigured(): boolean {
  return Object.values(PRICE_ENV).every((c) => Object.values(c).every((k) => !!process.env[k]))
}

/**
 * A Checkout Session (subscription mode) for the firm's platform subscription.
 * quantity = client-org count, so the graduated tiered price computes base +
 * overage. firmId rides in metadata so the return handler can persist the IDs.
 */
export async function createFirmBillingCheckout(input: {
  firmId: string
  plan: FirmPlan
  cycle: BillingCycle
  orgCount: number
  customerId: string | null
  origin: string
}): Promise<string> {
  const price = priceIdFor(input.plan, input.cycle)
  if (!price) throw new Error('firm price not configured')
  const session = await platformStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: Math.max(1, input.orgCount) }],
    customer: input.customerId ?? undefined,
    client_reference_id: input.firmId,
    metadata: { firmId: input.firmId, plan: input.plan, cycle: input.cycle },
    subscription_data: { metadata: { firmId: input.firmId } },
    success_url: `${input.origin}/clients?billing=active&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/clients?billing=cancel`,
  })
  if (!session.url) throw new Error('no checkout url')
  return session.url
}

/** Resolve a returned Checkout session into the firm's customer + subscription ids. */
export async function confirmFirmCheckout(
  sessionId: string,
): Promise<{ firmId: string; customerId: string; subscriptionId: string } | null> {
  const session = await platformStripe().checkout.sessions.retrieve(sessionId)
  const firmId = session.metadata?.firmId
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (session.status !== 'complete' || !firmId || !customerId || !subscriptionId) return null
  return { firmId, customerId, subscriptionId }
}

/** Keep the subscription quantity (= org count) in sync as the roster changes. */
export async function syncFirmSubscriptionQuantity(subscriptionId: string, orgCount: number): Promise<void> {
  const stripe = platformStripe()
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const item = sub.items.data[0]
  if (!item) return
  const qty = Math.max(1, orgCount)
  if (item.quantity === qty) return
  await stripe.subscriptionItems.update(item.id, { quantity: qty, proration_behavior: 'none' })
}

/**
 * Create (or reuse) a Stripe Connect account for an Option-2 firm and return an
 * onboarding link. Express accounts: the firm completes Stripe's hosted KYC, then
 * returns to `returnUrl`.
 */
export async function createConnectOnboarding(input: {
  existingAccountId: string | null
  firmName: string
  email: string
  refreshUrl: string
  returnUrl: string
}): Promise<{ accountId: string; url: string }> {
  const stripe = platformStripe()
  let accountId = input.existingAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: input.email,
      business_profile: { name: input.firmName },
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { naviioFirm: input.firmName },
    })
    accountId = account.id
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: 'account_onboarding',
  })
  return { accountId, url: link.url }
}

/** Whether a Connect account has finished onboarding and can receive transfers. */
export async function getConnectStatus(accountId: string): Promise<'pending' | 'enabled'> {
  const stripe = platformStripe()
  const account = await stripe.accounts.retrieve(accountId)
  return account.charges_enabled && account.payouts_enabled ? 'enabled' : 'pending'
}

/** Derive our connect status from a Stripe Account object (used by the webhook). */
export function statusOfAccount(account: Stripe.Account): 'pending' | 'enabled' {
  return account.charges_enabled && account.payouts_enabled ? 'enabled' : 'pending'
}

/** Verify + parse a Stripe Connect webhook (account.updated). Falls back to the
 *  main webhook secret if a Connect-specific one isn't set. */
export function constructConnectEvent(body: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || ''
  return platformStripe().webhooks.constructEvent(body, signature, secret)
}

/**
 * The Stripe Subscription params for an Option-2 CLIENT subscription, so the
 * client pays through Naviio and the firm receives (100 − commissionPct)%.
 * Wire this into your client-subscription create call.
 */
export function clientSubscriptionApplicationFee(
  plan: FirmPlan,
  connectAccountId: string,
): { application_fee_percent: number; transfer_data: { destination: string } } {
  return {
    application_fee_percent: getPlan(plan).commissionPct,
    transfer_data: { destination: connectAccountId },
  }
}
