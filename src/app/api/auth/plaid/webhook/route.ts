import {
  verifyPlaidWebhook,
  getOrgIdByItemId,
  syncTransactions,
  markItemError,
  clearItemError,
  markNewAccountsAvailable,
  offboardPlaidItem,
} from '@/lib/integrations/plaid'

/**
 * Plaid webhook receiver.
 *
 * Plaid POSTs item + transaction events here (URL configured via
 * PLAID_WEBHOOK_URL on the Link token). We verify the signed request, resolve
 * the owning org from `item_id`, and react:
 *   - TRANSACTIONS/* → incremental sync
 *   - ITEM error/expiration/revocation → flag for re-link
 */
export async function POST(request: Request) {
  // Read the RAW body first — signature verification depends on the exact bytes.
  const rawBody = await request.text()
  const verification = request.headers.get('plaid-verification')

  const valid = await verifyPlaidWebhook(rawBody, verification)
  if (!valid) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let payload: {
    webhook_type?: string
    webhook_code?: string
    item_id?: string
    error?: { error_code?: string } | null
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { webhook_type: type, webhook_code: code, item_id: itemId } = payload
  if (!itemId) return Response.json({ received: true })

  const orgId = await getOrgIdByItemId(itemId)
  // Unknown item — ack so Plaid stops retrying, but do nothing.
  if (!orgId) return Response.json({ received: true })

  try {
    if (type === 'TRANSACTIONS') {
      // SYNC_UPDATES_AVAILABLE / INITIAL_UPDATE / HISTORICAL_UPDATE /
      // DEFAULT_UPDATE / TRANSACTIONS_REMOVED all resolve via a cursor sync.
      await syncTransactions(orgId)
    } else if (type === 'ITEM') {
      if (
        code === 'USER_PERMISSION_REVOKED' ||
        code === 'USER_ACCOUNT_REVOKED' // Chase-only
      ) {
        // The user revoked access → offboard the item (revoke at Plaid + stop
        // syncing). Not a fixable error, so do NOT prompt a re-link.
        await offboardPlaidItem(orgId)
      } else if (
        code === 'ERROR' ||
        code === 'PENDING_EXPIRATION' ||
        code === 'PENDING_DISCONNECT'
      ) {
        // Connection needs end-user action → flag so the UI prompts a re-link.
        await markItemError(orgId)
      } else if (code === 'LOGIN_REPAIRED') {
        // Plaid auto-repaired the login → clear the ERROR flag and refresh data
        // so the reconnect prompt disappears without user action.
        await clearItemError(orgId)
        await syncTransactions(orgId)
      } else if (code === 'NEW_ACCOUNTS_AVAILABLE') {
        // The bank exposed new accounts on this item → prompt the user to add
        // them via update mode (account_selection_enabled).
        await markNewAccountsAvailable(orgId)
      }
      // WEBHOOK_UPDATE_ACKNOWLEDGED — no action needed.
    }
  } catch (err) {
    // Already logged + status-flagged downstream; ack so Plaid doesn't hammer us.
    console.error(`[plaid] webhook handler error (item_id=${itemId}, ${type}/${code}):`, err instanceof Error ? err.message : err)
  }

  return Response.json({ received: true })
}
