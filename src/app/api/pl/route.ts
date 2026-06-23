import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import * as cache from '@/lib/cache'
import { fetchQuickBooksData } from '@/lib/integrations/quickbooks'
import { fetchXeroData } from '@/lib/integrations/xero'
import { summarizeAccounting, type AccountingSummary } from '@/lib/integrations/accounting-map'
import { loadPrimaryLedger, startOfYearUTC, ledgerSources, connectedProviders, classificationOverrides } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import type { IntegrationProvider } from '@prisma/client'

/**
 * Fetch + summarize the connected accounting tools' P&L reports. Shared by the
 * cash-basis fallback and the accrual/GAAP section below (previously the same
 * block copy-pasted twice in this file).
 */
async function accountingSummary(
  orgId: string,
  connected: Set<IntegrationProvider>,
  method?: 'Accrual' | 'Cash',
): Promise<AccountingSummary | null> {
  if (!connected.has('QUICKBOOKS') && !connected.has('XERO')) return null
  const [qbo, xero] = await Promise.all([
    connected.has('QUICKBOOKS') ? fetchQuickBooksData(orgId, method).catch(() => null) : Promise.resolve(null),
    connected.has('XERO') ? fetchXeroData(orgId).catch(() => null) : Promise.resolve(null),
  ])
  return summarizeAccounting(qbo, xero)
}

/**
 * Resolve the YTD P&L summary. Plaid + Stripe are the source of truth, computed
 * by our own metric engine from the raw transaction ledger (so it's deduped and
 * never inherits an accounting tool's reconciliation/categorization errors):
 *   1. Transaction ledger (Plaid/Stripe) → metric engine  ← primary
 *   2. QuickBooks/Xero report parse                        ← fallback only
 *   3. null (no data) — the page shows a connect prompt, never demo
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const key = `org:${orgId}:pl`
    const cached = await cache.get<{ summary: unknown; source: string }>(key)
    if (cached) return Response.json(cached)

    let summary: AccountingSummary | null = null

    // 1) PRIMARY: compute from the raw ledger (Plaid/Stripe; else accounting txns).
    const ledger = await loadPrimaryLedger(orgId, startOfYearUTC())
    if (ledger.length > 0) {
      const ecOverrides = await classificationOverrides(orgId).catch(() => undefined)
      const is = incomeStatement(ledger, undefined, undefined, undefined, undefined, ecOverrides)
      const sources = await ledgerSources(orgId)
      summary = {
        source: 'synthesized',
        totalIncome: is.totalIncome,
        totalExpenses: is.totalExpenses,
        netIncome: is.netIncome,
        // Cost-of-revenue split now derived from the ledger (cross-industry COGS
        // heuristic + user tags), so the synthesized P&L shows gross profit.
        grossProfit: is.grossProfit,
        outstandingCount: null,
        outstandingAmount: null,
        currency: 'USD',
      }
      // Tag which raw sources backed it (used for the badge label downstream).
      ;(summary as AccountingSummary & { ledgerSources?: string[] }).ledgerSources = [...sources]
    }

    const connected = await connectedProviders(orgId)
    const hasAccounting = connected.has('QUICKBOOKS') || connected.has('XERO')

    // 2) FALLBACK: an accounting tool's report (less trusted; used only when the
    //    ledger has nothing — e.g. accounting-only customers).
    if (!summary) {
      summary = await accountingSummary(orgId, connected)
    }

    // ACCRUAL / GAAP basis — pulled straight from the connected accounting system
    // (QuickBooks on Accrual basis; Xero's report is accrual by default). This is
    // "GAAP as recorded in their books", shown alongside our cash-basis figure.
    const accrual = await accountingSummary(orgId, connected, 'Accrual')

    // 3) Nothing connected → no data (the UI prompts to connect; never demo).
    // Don't cache a transient accrual-fetch failure (accounting connected but the
    // report came back null) — otherwise the empty result sticks for the TTL.
    const accrualFetchFailed = hasAccounting && accrual == null
    const payload = { summary, source: summary?.source ?? 'none', accrual }
    if ((summary || accrual) && !accrualFetchFailed) await cache.set(key, payload, cache.TTL.MEDIUM)
    return Response.json(payload)
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ summary: null, source: 'none' })
  }
}
