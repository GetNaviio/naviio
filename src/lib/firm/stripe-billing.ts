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
import { getPlan, type FirmPlan } from '@/lib/firm/billing'

export function isBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

function platformStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
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
