import { requireAuth } from '@/lib/auth'
import { getAuthUrl } from '@/lib/integrations/adp'

export async function GET() {
  try {
    const user = await requireAuth()
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64')
    return Response.redirect(getAuthUrl(state))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate ADP OAuth' }, { status: 500 })
  }
}
