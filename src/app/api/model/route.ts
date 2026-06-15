import { withOrg } from '@/lib/api/with-org'
import { loadPrimaryLedger, startOfYearUTC, classificationOverrides } from '@/lib/metrics/ledger'
import { modelIncomeStatement, type ModelTxn } from '@/lib/model/incomeStatement'

/**
 * Financial model base data: the current YTD gross-margin income statement
 * (Revenue → COGS → Gross Profit → OpEx → Operating Income) computed from the
 * raw Plaid/Stripe ledger, plus monthly run-rate defaults that seed the
 * forward projection on the page. COGS uses the heuristic split for now (manual
 * tagging is a separate feature).
 */
export const GET = withOrg(async (_request, { orgId }) => {
  const [ledger, overrides] = await Promise.all([
    loadPrimaryLedger(orgId, startOfYearUTC()),
    classificationOverrides(orgId),
  ])
  const txns: ModelTxn[] = ledger.map((r) => ({
    source: r.source, type: r.type, amount: r.amount,
    category: r.category, description: r.description, merchantName: r.merchantName,
    externalId: r.externalId,
  }))
  const statement = modelIncomeStatement(txns, overrides)

  // Monthly run-rate defaults to seed the projection.
  const monthsElapsed = new Date().getUTCMonth() + 1 // Jan = 1
  const defaults = {
    monthlyRevenue: Math.round(statement.revenue / monthsElapsed),
    monthlyOpex: Math.round(statement.opex / monthsElapsed),
    grossMarginPct: statement.grossMargin != null ? Math.round(statement.grossMargin * 1000) / 10 : 70,
  }

  return Response.json({ statement, defaults, hasData: txns.length > 0 })
})
