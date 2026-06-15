import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { exchangePublicToken } from '@/lib/integrations/plaid'

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)
    const { public_token } = await request.json()
    if (!public_token) return Response.json({ error: 'public_token is required' }, { status: 400 })
    await exchangePublicToken(orgId, public_token)
    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Plaid exchange-token error:', message)
    return Response.json({ error: 'Failed to exchange token' }, { status: 500 })
  }
}
