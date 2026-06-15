import { requireAuth } from '@/lib/auth'

/**
 * Plaid Link conversion logging. The Link component posts each `onEvent` here so
 * we have our own funnel data (open → institution search → credential submit →
 * OAuth handoff → success / exit / error) in addition to Plaid's built-in Link
 * Analytics. Metadata carries no financial PII — only event/view names, the
 * institution id, link_session_id, and any error code.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json().catch(() => ({}))
    const event = typeof body?.event === 'string' ? body.event : 'UNKNOWN'
    const metadata = body?.metadata ?? {}

    console.warn(
      '[plaid-link-event]',
      JSON.stringify({ at: new Date().toISOString(), userId: user.id, event, metadata }),
    )

    return new Response(null, { status: 204 })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Analytics must never break the Link flow — swallow and ack.
    return new Response(null, { status: 204 })
  }
}
