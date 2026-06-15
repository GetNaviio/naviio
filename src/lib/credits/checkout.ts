/**
 * Stripe Checkout for buying credit reloads on Naviio's OWN (platform) Stripe
 * account — distinct from the Connect client we use to READ a customer's Stripe
 * data. This is how we collect money; the webhook tops up the credit balance.
 */
import Stripe from 'stripe'
import { packById } from '@/lib/credits/rates'
import { recordPurchase, getBalance } from '@/lib/credits/account'

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

/**
 * Sanitize a post-checkout return path. Only an in-app path (a single leading
 * slash followed by safe chars) is allowed — anything else (absolute URLs,
 * protocol-relative `//evil.com`, schemes) would be an open redirect on the
 * Stripe success/cancel URL, so it falls back to '/dashboard'.
 */
export function safeReturnPath(returnPath: string | undefined): string {
  if (!returnPath) return '/dashboard'
  return /^\/[A-Za-z0-9/_-]*$/.test(returnPath) ? returnPath : '/dashboard'
}

/**
 * Create a one-time Checkout Session for a credit pack. orgId + credits ride in
 * metadata so the webhook knows who to credit and how much. Returns the hosted
 * Checkout URL to redirect the user to.
 */
export async function createCreditCheckout(
  orgId: string,
  packId: string,
  origin: string,
  returnPath = '/dashboard',
): Promise<string> {
  const pack = packById(packId)
  if (!pack) throw new Error('unknown_pack')
  const safeReturn = safeReturnPath(returnPath)
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.priceCents,
          product_data: {
            name: `Naviio — ${pack.credits} credits`,
            description: pack.name,
          },
        },
      },
    ],
    metadata: { orgId, packId: pack.id, credits: String(pack.credits) },
    success_url: `${origin}${safeReturn}?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${safeReturn}?credits=cancel`,
  })
  if (!session.url) throw new Error('no_checkout_url')
  return session.url
}

/**
 * Confirm a returned Checkout session and grant credits if it's paid — the
 * webhook-independent path used when the user lands back on the dashboard.
 * Idempotent (recordPurchase keys on the session id), and only grants for a
 * session that belongs to THIS org.
 */
export async function confirmCreditSession(
  orgId: string,
  sessionId: string,
): Promise<{ granted: boolean; balance: number }> {
  const session = await stripe().checkout.sessions.retrieve(sessionId)
  const sessOrg = session.metadata?.orgId
  // Derive credits from the server-defined pack, not client-visible metadata.
  const pack = packById(session.metadata?.packId ?? '')
  if (session.payment_status !== 'paid' || sessOrg !== orgId || !pack) {
    return { granted: false, balance: await getBalance(orgId) }
  }
  return recordPurchase(orgId, pack.credits, session.id)
}

/** Verify + parse a Stripe webhook for the credits flow. */
export function constructCreditsEvent(body: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_CREDITS_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || ''
  return stripe().webhooks.constructEvent(body, signature, secret)
}
