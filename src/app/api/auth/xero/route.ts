import { requireAuth } from '@/lib/auth'
import { getAuthUrl } from '@/lib/integrations/xero'

export async function GET() {
  try {
    const user = await requireAuth()
    if (!process.env.XERO_CLIENT_ID) {
      return Response.redirect(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/integrations?error=xero_not_configured`)
    }
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64')
    return Response.redirect(getAuthUrl(state))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate Xero OAuth' }, { status: 500 })
  }
}
