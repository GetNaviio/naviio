import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import {
  clearItemError,
  clearNewAccountsAvailable,
  syncTransactions,
} from '@/lib/integrations/plaid'

/**
 * Called after an UPDATE-MODE Link flow completes (re-auth or add-accounts).
 * Update mode keeps the existing access token, so there is NO public token to
 * exchange — instead we clear the reconnect / new-accounts flags and resync to
 * pull the repaired connection or newly-added accounts.
 */
export async function POST() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    await clearItemError(orgId)
    await clearNewAccountsAvailable(orgId)
    await syncTransactions(orgId)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Plaid refresh error:', message)
    return Response.json({ error: 'Failed to refresh' }, { status: 500 })
  }
}
