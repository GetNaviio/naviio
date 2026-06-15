import { requireAuth, clearSessionCookie } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { removePlaidItem } from '@/lib/integrations/plaid'
import { deauthorizeStripe } from '@/lib/integrations/stripe'
import { revokeQuickBooks } from '@/lib/integrations/quickbooks'
import { revokeXero } from '@/lib/integrations/xero'
import type { IntegrationProvider } from '@prisma/client'

// Best-effort, provider-side token revocation (each helper swallows its errors).
async function revokeAtProvider(provider: IntegrationProvider, orgId: string): Promise<void> {
  switch (provider) {
    case 'PLAID':      return removePlaidItem(orgId)
    case 'STRIPE':     return deauthorizeStripe(orgId)
    case 'QUICKBOOKS': return revokeQuickBooks(orgId)
    case 'XERO':       return revokeXero(orgId)
    default:           return
  }
}

/**
 * Account deletion request (SEC-POL-003 §5.2). Within 24h obligations are met
 * synchronously here: revoke all OAuth tokens at the providers, flag the account
 * deleted (disabling all access immediately), and clear the session. The actual
 * permanent purge of all financial + account data happens via the nightly purge
 * job once the 30-day grace window elapses (`/api/cron/purge`).
 */
export async function DELETE() {
  try {
    const user = await requireAuth()

    // 1) Revoke at every connected provider while we still hold the tokens.
    const orgs = await prisma.organization.findMany({
      where: { userId: user.id },
      select: { id: true, integrations: { select: { provider: true } } },
    })
    for (const org of orgs) {
      for (const integ of org.integrations) {
        await revokeAtProvider(integ.provider, org.id)
      }
      await cache.delPattern(`org:${org.id}:*`)
    }

    // 2) Flag the account deleted — disables access immediately (getSessionUser
    //    and login both reject a user with deletedAt set). Also blank the stored
    //    integration tokens now so nothing is reusable during the grace window.
    const now = new Date()
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: now } })
    await prisma.integration.updateMany({
      where: { orgId: { in: orgs.map((o) => o.id) } },
      data: { status: 'DISCONNECTED', accessToken: null, refreshToken: null, itemId: null, transactionCursor: null },
    })

    // 3) Clear the session cookie.
    await clearSessionCookie()

    return Response.json({
      success: true,
      message: 'Account scheduled for deletion. Access is disabled now; all data is permanently deleted within 30 days.',
    })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Account deletion error:', err)
    return Response.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
