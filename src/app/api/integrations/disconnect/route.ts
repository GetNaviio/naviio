import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { removePlaidItem } from '@/lib/integrations/plaid'
import { deauthorizeStripe } from '@/lib/integrations/stripe'
import { revokeQuickBooks } from '@/lib/integrations/quickbooks'
import { revokeXero } from '@/lib/integrations/xero'
import type { IntegrationProvider } from '@prisma/client'

// Map the lowercase UI provider id → the Prisma enum value stored in the DB.
const PROVIDER_ENUM: Record<string, IntegrationProvider> = {
  plaid: 'PLAID',
  quickbooks: 'QUICKBOOKS',
  stripe: 'STRIPE',
  xero: 'XERO',
  gusto: 'GUSTO',
  adp: 'ADP',
  shopify: 'SHOPIFY',
  ghl: 'GOHIGHLEVEL',
  gohighlevel: 'GOHIGHLEVEL',
  'meta-ads': 'META_ADS',
  'google-ads': 'GOOGLE_ADS',
}

// Best-effort, provider-side token revocation. Each helper swallows its own
// errors, so a provider being unreachable never blocks the local disconnect.
async function revokeAtProvider(provider: IntegrationProvider, orgId: string): Promise<void> {
  switch (provider) {
    case 'PLAID':      return removePlaidItem(orgId)
    case 'STRIPE':     return deauthorizeStripe(orgId)
    case 'QUICKBOOKS': return revokeQuickBooks(orgId)
    case 'XERO':       return revokeXero(orgId)
    default:           return
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const raw = new URL(request.url).searchParams.get('provider')?.toLowerCase().trim()
    if (!raw) return Response.json({ error: 'provider is required' }, { status: 400 })

    const provider = PROVIDER_ENUM[raw]
    if (!provider) return Response.json({ error: `unknown provider: ${raw}` }, { status: 400 })

    // 1) Revoke at the provider while we still hold the tokens (best-effort).
    //    Fully isolated: a provider error — or a token that can't be decrypted
    //    (e.g. TOKEN_ENCRYPTION_KEY rotated) — must NEVER block the local
    //    teardown below. The user can always disconnect.
    try {
      await revokeAtProvider(provider, orgId)
    } catch (revokeErr) {
      console.error('Integration disconnect: provider revoke failed (continuing):', revokeErr)
    }

    // 2) Tear down locally — idempotent (updateMany won't throw if no row), and
    //    wipe every token/cursor/tenant field so nothing stale can be reused.
    const { count } = await prisma.integration.updateMany({
      where: { orgId, provider },
      data: {
        status: 'DISCONNECTED',
        accessToken: null,
        refreshToken: null,
        realmId: null,
        itemId: null,
        transactionCursor: null,
        expiresAt: null,
      },
    })

    // 3) Bust cached metrics/dashboard so the UI reflects the disconnect at once.
    await cache.delPattern(`org:${orgId}:*`)

    return Response.json({ success: true, provider: raw, disconnected: count > 0 })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Integration disconnect error:', err)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
