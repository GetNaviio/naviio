import { constructCreditsEvent } from '@/lib/credits/checkout'
import { recordPurchase } from '@/lib/credits/account'
import { packById } from '@/lib/credits/rates'
import { log, errField } from '@/lib/log'

// Stripe webhook for credit purchases. Verifies the signature, then on a
// completed Checkout session grants the credits to the org (idempotently).
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'no signature' }, { status: 400 })

  const body = await request.text() // raw body required for signature verification

  let event
  try {
    event = constructCreditsEvent(body, signature)
  } catch (err) {
    console.error('credits webhook signature verification failed:', err)
    return Response.json({ error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      id: string
      payment_status?: string
      metadata?: { orgId?: string; packId?: string } | null
    }
    const orgId = session.metadata?.orgId
    // Credits come from the server-defined pack, not trusted client metadata.
    const pack = packById(session.metadata?.packId ?? '')
    if (session.payment_status === 'paid') {
      if (!orgId || !pack) {
        // A PAID session we cannot attribute (missing/unknown metadata — e.g. a
        // pack sold by a newer deploy than this one). Retrying won't fix bad
        // metadata, so ack 200 — but log loudly: this is money received with no
        // credits granted, and it needs manual reconciliation.
        log.error('credits_unresolved_purchase', {
          sessionId: session.id,
          orgId: orgId ?? 'missing',
          packId: session.metadata?.packId ?? 'missing',
          action: 'credits NOT granted — manual reconciliation required',
        })
      } else {
        try {
          await recordPurchase(orgId, pack.credits, session.id)
        } catch (err) {
          // Transient failure (DB down, pool exhausted): return 5xx so Stripe
          // retries — recordPurchase is idempotent on session.id, so a replay
          // after a partial failure can never double-credit.
          log.error('credits_persist_failed', { sessionId: session.id, orgId, err: errField(err) })
          return Response.json({ error: 'failed to record purchase' }, { status: 500 })
        }
      }
    }
  }

  return Response.json({ received: true })
}
