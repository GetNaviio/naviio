import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { loadPrimaryLedger, monthsAgoUTC, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { ymOfDate } from '@/lib/model/workforce'

/**
 * Per-month cash-basis P&L for the trailing 24 months (+ current MTD) — the
 * full window Plaid backfills. Powers the P&L tab's month drill-down and the
 * prior-year comparison: with 24 closed months, every month in the last year
 * has a same-month-last-year counterpart.
 *
 * Each month carries its own expense-category breakdown so the category card
 * can rescope to the selected month, and the response carries the trust-layer
 * meta (per-source freshness + partial-month flag) so a month is never
 * silently graded against incomplete actuals.
 */
export const GET = withOrg(async (_request, { orgId }) => {
  const [ledger, catOverrides, integrations] = await Promise.all([
    loadPrimaryLedger(orgId, monthsAgoUTC(24)), // 25 buckets: 24 closed + current
    categoryOverrides(orgId), // user category fixes — applied everywhere
    prisma.integration.findMany({
      // ONLY providers that feed the transaction ledger — the freshness badge
      // describes the ACTUALS. Ad platforms (META_ADS/GOOGLE_ADS) feed the
      // separate AdInsight dataset and must not appear here or age the badge.
      where: { orgId, status: 'CONNECTED', provider: { in: ['PLAID', 'STRIPE', 'QUICKBOOKS', 'XERO'] } },
      select: { provider: true, lastSyncedAt: true },
    }),
  ])

  // Bucket the ledger by 'YYYY-MM', then run the SAME classifier the YTD
  // statement uses on each bucket — one definition of income/expense, every view.
  const buckets = new Map<string, typeof ledger>()
  for (const t of ledger) {
    const ym = ymOfDate(t.date instanceof Date ? t.date : new Date(t.date))
    const arr = buckets.get(ym)
    if (arr) arr.push(t)
    else buckets.set(ym, [t])
  }

  const months = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, txns]) => {
      const s = incomeStatement(txns, undefined, undefined, catOverrides)
      return {
        month,
        income: s.totalIncome,
        expenses: s.totalExpenses,
        net: s.netIncome,
        netMargin: s.netMargin,
        expensesByCategory: s.expensesByCategory,
      }
    })

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
