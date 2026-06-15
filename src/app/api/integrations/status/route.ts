import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { IntegrationProvider } from '@prisma/client'

// Enum (DB) → lowercase id the UI uses.
const UI_ID: Record<IntegrationProvider, string> = {
  PLAID: 'plaid',
  QUICKBOOKS: 'quickbooks',
  STRIPE: 'stripe',
  XERO: 'xero',
  GUSTO: 'gusto',
  ADP: 'adp',
  SHOPIFY: 'shopify',
  GOHIGHLEVEL: 'ghl',
  META_ADS: 'meta-ads',
  GOOGLE_ADS: 'google-ads',
}

/**
 * Fast, DB-only connection status — no external provider calls. Used by the
 * Integrations page on mount so connected cards render immediately instead of
 * flashing "Connect" while the heavy live-data sync runs.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    // Include ERROR items too: an item that needs re-authentication (e.g. the
    // user changed their bank password) must surface in the UI as "reconnect",
    // not silently vanish as if never connected.
    const rows = await prisma.integration.findMany({
      where: { orgId, status: { in: ['CONNECTED', 'ERROR'] } },
      select: { provider: true, lastSyncedAt: true, status: true, newAccountsAvailable: true },
    })

    const sources: Record<string, boolean> = {}
    const reconnect: Record<string, boolean> = {}
    const newAccounts: Record<string, boolean> = {}
    let latest: Date | null = null
    for (const r of rows) {
      const id = UI_ID[r.provider]
      if (r.status === 'ERROR') {
        reconnect[id] = true
      } else {
        sources[id] = true
        // Healthy item with new accounts the bank exposed → prompt to add them.
        if (r.newAccountsAvailable) newAccounts[id] = true
      }
      if (r.lastSyncedAt && (!latest || r.lastSyncedAt > latest)) latest = r.lastSyncedAt
    }

    return Response.json({ sources, reconnect, newAccounts, syncedAt: latest?.toISOString() ?? null })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ sources: {}, reconnect: {}, newAccounts: {}, syncedAt: null })
  }
}
