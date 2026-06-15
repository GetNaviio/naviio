import { withOrg } from '@/lib/api/with-org'
import { chargeCredits, addCredits, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'
import { refreshTransactions } from '@/lib/integrations/plaid'
import { log, errField } from '@/lib/log'

const COST = costOf('realtime_refresh')

/**
 * Paid real-time refresh. Reserves credits atomically, calls Plaid
 * /transactions/refresh, and refunds if the refresh fails — so the user is only
 * charged for a successful refresh. 402 when out of credits.
 */
export const POST = withOrg(async (_request, { orgId }) => {
  // Reserve the credits first (atomic, refuses to go negative).
  let balance: number
  try {
    balance = await chargeCredits(orgId, 'realtime_refresh')
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return Response.json(
        { error: 'insufficient_credits', needed: e.needed, balance: e.balance, cost: COST },
        { status: 402 },
      )
    }
    throw e
  }

  try {
    const result = await refreshTransactions(orgId)
    return Response.json({ ok: true, cost: COST, balance, synced: result.synced })
  } catch (err) {
    // Refund so a failed refresh never costs the user. The refund itself can
    // fail (DB outage mid-request) — guard it, or this catch rethrows, the
    // client gets an opaque 500, and a charge stands with no service and no
    // audit trail. On refund failure: report the post-charge balance
    // truthfully and log enough to reconcile manually.
    const notConnected = err instanceof Error && err.message === 'PLAID_NOT_CONNECTED'
    let finalBalance = balance // post-charge balance (truth if refund fails)
    try {
      finalBalance = await addCredits(orgId, COST, 'refund', { feature: 'realtime_refresh' })
    } catch (refundErr) {
      log.error('credits_refund_failed', {
        orgId,
        feature: 'realtime_refresh',
        cost: COST,
        action: 'REFUND FAILED — charge stands without service, reconcile manually',
        err: errField(refundErr),
      })
    }
    return Response.json(
      { error: notConnected ? 'plaid_not_connected' : 'refresh_failed', balance: finalBalance },
      { status: notConnected ? 400 : 502 },
    )
  }
})
