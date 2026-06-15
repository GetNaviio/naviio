import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import * as cache from '@/lib/cache'
import { loadPrimaryLedger, startOfYearUTC, ledgerSources, connectedProviders, monthsAgoUTC, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { marketingSpend } from '@/lib/metrics/marketing'
import { getCashBalance } from '@/lib/integrations/plaid'

/**
 * Unified live-metrics endpoint — the single source the dashboard tabs read.
 * Everything is computed by our metric engine from the deduplicated transaction
 * ledger (Plaid + Stripe primary). Returns `hasData: false` when nothing is
 * connected so the UI can show connect-prompts instead of demo numbers.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const key = `org:${orgId}:metrics`
    const cached = await cache.get<unknown>(key)
    if (cached) return Response.json(cached)

    // Which integrations are connected (for source labels + connect-prompts).
    const connected = await connectedProviders(orgId)
    const sources = {
      plaid: connected.has('PLAID'),
      stripe: connected.has('STRIPE'),
      quickbooks: connected.has('QUICKBOOKS'),
      xero: connected.has('XERO'),
    }

    // Trailing 13 months of ledger (covers a 12-month series + current month).
    // Source-of-truth hierarchy: Plaid/Stripe rows win; accounting only as fallback.
    const [ledger, catOverrides] = await Promise.all([
      loadPrimaryLedger(orgId, monthsAgoUTC(12)),
      categoryOverrides(orgId), // user category fixes — applied everywhere
    ])

    const is = incomeStatement(ledger, startOfYearUTC(), undefined, catOverrides) // YTD income statement
    const cf = cashFlow(ledger)                            // trailing cash flow
    const marketing = { thisMonth: marketingSpend(ledger, monthsAgoUTC(0)) }
    const cashBalance = sources.plaid ? await getCashBalance(orgId).catch(() => null) : null
    const runway = cashBalance != null && cf.burnRate > 0 ? runwayMonths(cashBalance, cf.burnRate) : null

    const payload = {
      hasData: ledger.length > 0 || cashBalance != null,
      sources,
      ledgerSources: [...(await ledgerSources(orgId))],
      incomeStatement: is,
      cashFlow: cf,
      cash: { balance: cashBalance },
      runwayMonths: runway,
      marketing,
      generatedAt: new Date().toISOString(),
    }

    await cache.set(key, payload, cache.TTL.MEDIUM)
    return Response.json(payload)
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ hasData: false, error: 'metrics_failed' }, { status: 200 })
  }
}
