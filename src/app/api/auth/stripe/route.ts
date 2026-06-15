import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { getConnectAuthUrl } from '@/lib/integrations/stripe'
import { prisma } from '@/lib/prisma'

// GET  → redirect to Stripe Connect OAuth (platform accounts)
// POST → save a manually entered API key (simpler flow for solo operators)
export async function GET() {
  try {
    const user = await requireAuth()
    if (!process.env.STRIPE_CLIENT_ID) {
      // Connect isn't configured — send the user back with a clear message
      // instead of bouncing to Stripe's "no application matches" error page.
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/integrations?error=stripe_connect_not_configured`,
      )
    }
    await getDefaultOrgId(user.id)
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64')
    return Response.redirect(getConnectAuthUrl(state))
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to initiate Stripe Connect' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)
    const { apiKey } = await request.json()
    // Accept a restricted read-only key (rk_…, recommended) or a secret key (sk_…).
    if (typeof apiKey !== 'string' || !(apiKey.startsWith('rk_') || apiKey.startsWith('sk_'))) {
      return Response.json({ error: 'Enter a Stripe key starting with rk_ or sk_' }, { status: 400 })
    }

    await prisma.integration.upsert({
      where: { orgId_provider: { orgId, provider: 'STRIPE' } },
      create: { orgId, provider: 'STRIPE', status: 'CONNECTED', accessToken: apiKey, lastSyncedAt: new Date() },
      update: { status: 'CONNECTED', accessToken: apiKey, lastSyncedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to save Stripe key' }, { status: 500 })
  }
}
