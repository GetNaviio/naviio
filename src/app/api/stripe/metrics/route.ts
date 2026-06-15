import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { getStripeMetrics } from '@/lib/integrations/stripe'
import { prisma } from '@/lib/prisma'

/**
 * Live Stripe revenue metrics — gated strictly on a CONNECTED Stripe integration
 * for THIS org. The platform's own STRIPE_SECRET_KEY is never treated as org-level
 * connectivity (that would leak the platform account's data to every tenant), and
 * we return `source: 'none'` rather than demo data when not connected.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const integration = await prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: 'STRIPE' } },
      select: { accessToken: true, status: true },
    })
    const connected = integration?.status === 'CONNECTED' && !!integration.accessToken
    if (!connected) {
      return Response.json({ metrics: null, history: [], source: 'none' })
    }

    const metrics = await getStripeMetrics(orgId)
    if (!metrics) {
      return Response.json({ metrics: null, history: [], source: 'none' })
    }
    return Response.json({
      metrics,
      history: metrics.revenueByMonth ?? [],
      source: 'stripe',
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ metrics: null, history: [], source: 'none' })
  }
}
