import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { loadPrimaryLedger, monthsAgoUTC, classificationOverrides } from '@/lib/metrics/ledger'
import { modelIncomeStatement, type ModelTxn } from '@/lib/model/incomeStatement'
import { ymOfDate } from '@/lib/model/workforce'

/**
 * Per-month gross-margin income statement (Revenue / COGS / OpEx / Operating
 * Income) for the trailing 24 months, computed from the primary ledger with
 * the same classifier the Financial Model statement uses. Feeds the Budget vs
 * Actuals and TTM Forecast tabs.
 */
export const GET = withOrg(async (_request, { orgId }) => {
  const [ledger, overrides, integrations] = await Promise.all([
    loadPrimaryLedger(orgId, monthsAgoUTC(23)), // 24 months incl. current
    classificationOverrides(orgId), // user COGS/OpEx tags — must apply everywhere
    prisma.integration.findMany({
      // ONLY providers that feed the transaction ledger — the freshness badge
      // describes the ACTUALS. Ad platforms (META_ADS/GOOGLE_ADS) feed the
      // separate AdInsight dataset and must not appear here or age the badge.
      where: { orgId, status: 'CONNECTED', provider: { in: ['PLAID', 'STRIPE', 'QUICKBOOKS', 'XERO'] } },
      select: { provider: true, lastSyncedAt: true },
    }),
  ])

  // Bucket transactions by 'YYYY-MM' and run the classifier per bucket.
  const buckets = new Map<string, ModelTxn[]>()
  for (const t of ledger) {
    const ym = ymOfDate(t.date instanceof Date ? t.date : new Date(t.date))
    const arr = buckets.get(ym)
    if (arr) arr.push(t)
    else buckets.set(ym, [t])
  }

  const months = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, txns]) => {
      const s = modelIncomeStatement(txns, overrides)
      return {
        month,
        revenue: Math.round(s.revenue),
        cogs: Math.round(s.cogs),
        opex: Math.round(s.opex),
        operatingIncome: Math.round(s.revenue) - Math.round(s.cogs) - Math.round(s.opex),
      }
    })

  // Freshness + completeness metadata — the trust layer. Consumers must be
  // able to tell users HOW CURRENT and HOW COMPLETE these numbers are.
  const currentMonth = ymOfDate()
  const meta = {
    currentMonth,
    currentMonthIsPartial: true, // by definition — it hasn't closed
    sources: integrations.map((i) => ({
      provider: i.provider,
      lastSyncedAt: i.lastSyncedAt?.toISOString() ?? null,
    })),
    generatedAt: new Date().toISOString(),
  }

  return Response.json({ months, hasData: months.length > 0, meta })
})
