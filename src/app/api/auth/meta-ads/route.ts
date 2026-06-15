import { requireAuth } from '@/lib/auth'
import { getAuthUrl, isConfigured } from '@/lib/integrations/meta-ads'

export async function GET() {
  try {
    const user = await requireAuth()
    if (!isConfigured()) return Response.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/integrations?error=meta_ads_not_configured`)
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64')
    return Response.redirect(getAuthUrl(state))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate Meta Ads OAuth' }, { status: 500 })
  }
}
