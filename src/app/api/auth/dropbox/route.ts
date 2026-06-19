/**
 * Initiate Dropbox OAuth (file sharing). Read-only scopes. The connection lets a
 * client or their advisor list/link documents that live in Dropbox — Naviio never
 * stores the files. Env-gated: redirects back with an error if not configured.
 */
import { requireAuth } from '@/lib/auth'
import { getAuthUrl, isConfigured } from '@/lib/documents/dropbox'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const origin = new URL(request.url).origin
    if (!isConfigured()) return Response.redirect(`${origin}/documents?error=dropbox_not_configured`)
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64')
    return Response.redirect(getAuthUrl(state, origin))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate Dropbox OAuth' }, { status: 500 })
  }
}
