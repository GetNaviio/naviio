import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { loadPrimaryLedger, monthsAgoUTC } from '@/lib/metrics/ledger'
import { modelIncomeStatement } from '@/lib/model/incomeStatement'
import { buildTtmForecast } from '@/lib/model/ttm'
import { ymOfDate } from '@/lib/model/workforce'
import { buildFpaWorkbook, type BudgetCell } from '@/lib/model/fpa-xlsx'

export const runtime = 'nodejs'

/**
 * One-click FP&A workbook: TTM Forecast + Budget + Workforce sheets.
 * GET so the UI can use a plain download link. ?year= selects the budget year
 * (defaults to current). TTM assumptions are server-derived run-rate defaults
 * (same formula the Financial Model page seeds with), so the export never
 * depends on unsaved client state. The Budget and Workforce sheets are the
 * import templates for the matching import endpoints.
 */
export const GET = withOrg(async (request, { orgId }) => {
  const url = new URL(request.url)
  const yearParam = url.searchParams.get('year')
  const year = /^\d{4}$/.test(yearParam ?? '') ? yearParam! : String(new Date().getUTCFullYear())

  // ?template=1 → blank import templates (zeroed Budget grid + empty Workforce
  // sheet), no org data, no TTM sheet. For first-time users and clean restarts.
  if (url.searchParams.get('template') === '1') {
    const buf = await buildFpaWorkbook({
      year,
      budget: [],
      roles: [],
      ttm: { months: [], columns: [], total: { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, workforceDelta: 0, operatingIncome: 0 } },
      ttmAnchor: ymOfDate(),
      templateOnly: true,
    })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="naviio-fpa-template-${year}.xlsx"`,
      },
    })
  }

  const [budgetRows, roles, ledger] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { orgId, month: { startsWith: `${year}-` } },
      select: { month: true, line: true, amount: true },
    }),
    prisma.workforceRole.findMany({ where: { orgId }, orderBy: [{ startMonth: 'asc' }] }),
    loadPrimaryLedger(orgId, monthsAgoUTC(11)), // trailing 12 months for run-rate defaults
  ])

  // Run-rate defaults — same seeding the Financial Model page uses.
  const stmt = modelIncomeStatement(ledger)
  const monthsElapsed = new Date().getUTCMonth() + 1
  const assumptions = {
    startRevenue: Math.round(stmt.revenue / monthsElapsed),
    growth: 0.05,
    grossMargin: stmt.grossMargin ?? 0.7,
    startOpex: Math.round(stmt.opex / monthsElapsed),
    opexGrowth: 0.02,
  }

  const anchor = ymOfDate()
  const ttm = buildTtmForecast(anchor, assumptions, roles)

  const buf = await buildFpaWorkbook({
    year,
    budget: budgetRows as BudgetCell[],
    roles,
    ttm,
    ttmAnchor: anchor,
  })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="naviio-fpa-${year}.xlsx"`,
    },
  })
})
