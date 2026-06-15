import { requireAuth } from '@/lib/auth'
import { getAuthUrl } from '@/lib/integrations/shopify'

// GET /api/auth/shopify?shop=mystore.myshopify.com
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const shop = searchParams.get('shop')
    if (!shop) return Response.json({ error: 'shop parameter required (e.g. mystore.myshopify.com)' }, { status: 400 })

    const state = Buffer.from(JSON.stringify({ userId: user.id, shop, ts: Date.now() })).toString('base64')
    return Response.redirect(getAuthUrl(shop, state))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate Shopify OAuth' }, { status: 500 })
  }
}
