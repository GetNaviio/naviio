import { verifyWebhookSignature, handleStripeEvent } from '@/lib/integrations/stripe'

export const runtime = 'nodejs'

/**
 * Stripe webhook receiver. Verifies the signature against the RAW body, then
 * delegates to handleStripeEvent which resolves the org (via the Connect
 * account id) and re-syncs charges + cached metrics.
 *
 * Handled: payment_intent.succeeded, customer.subscription.created/updated/
 * deleted, charge.refunded.
 */
export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  let event
  try {
    event = await verifyWebhookSignature(body, sig)
  } catch (err) {
    console.error('Stripe webhook signature failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await handleStripeEvent(event)
  } catch (err) {
    // Acknowledge so Stripe doesn't hammer retries; the error is logged.
    console.error('Stripe webhook processing error:', err instanceof Error ? err.message : err)
  }

  return Response.json({ received: true })
}
