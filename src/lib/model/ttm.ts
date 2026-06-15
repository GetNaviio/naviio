/**
 * Rolling 12-month (TTM-anchored) forecast — pure, unit-testable.
 *
 * Layout matches the classic FP&A artifact: P&L lines on the rows, months on
 * the columns. The grid covers the next 12 months starting at the anchor month
 * (usually the current month), with a TTM-actuals reference column on the left
 * and a 12-month total on the right.
 *
 * Forecast math per month index i (0 = anchor month):
 *   revenue_i = startRevenue × (1 + growth)^i
 *   cogs_i    = revenue_i × (1 − grossMargin)
 *   opex_i    = startOpex × (1 + opexGrowth)^i + workforceDelta_i
 * where workforceDelta_i = plannedWorkforceCost(month_i) − plannedWorkforceCost(anchor).
 * The delta convention keeps the baseline honest: current payroll is already in
 * the opex run-rate; only the PLAN (future hires / planned departures) moves
 * the forecast. The delta is its own visible row so the math stays auditable.
 *
 * Identities preserved exactly (rounded values are derived, not re-rounded):
 *   grossProfit + cogs = revenue · grossProfit − opex = operatingIncome
 */
import { monthKeys, workforceCostForMonth, type PlannedRole } from './workforce'

export interface TtmAssumptions {
  startRevenue: number
  /** Monthly revenue growth, fraction (0.05 = 5%/mo). */
  growth: number
  /** Gross margin, fraction (0.7 = 70%). */
  grossMargin: number
  startOpex: number
  /** Monthly opex growth, fraction. */
  opexGrowth: number
}

export interface TtmColumn {
  month: string // 'YYYY-MM'
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  workforceDelta: number
  operatingIncome: number
}

export interface TtmTable {
  months: string[]
  columns: TtmColumn[]
  total: Omit<TtmColumn, 'month'>
}

export function buildTtmForecast(
  anchorMonth: string,
  assumptions: TtmAssumptions,
  roles: PlannedRole[] = [],
  horizon = 12,
): TtmTable {
  const months = monthKeys(anchorMonth, horizon)
  const baselineWorkforce = workforceCostForMonth(roles, anchorMonth)

  const columns: TtmColumn[] = months.map((month, i) => {
    const revenue = Math.round(assumptions.startRevenue * Math.pow(1 + assumptions.growth, i))
    const grossProfit = Math.round(revenue * assumptions.grossMargin)
    const cogs = revenue - grossProfit // derived → identity holds exactly
    const workforceDelta = Math.round(workforceCostForMonth(roles, month) - baselineWorkforce)
    const opex = Math.round(assumptions.startOpex * Math.pow(1 + assumptions.opexGrowth, i)) + workforceDelta
    const operatingIncome = grossProfit - opex
    return { month, revenue, cogs, grossProfit, opex, workforceDelta, operatingIncome }
  })

  const total = columns.reduce(
    (a, c) => ({
      revenue: a.revenue + c.revenue,
      cogs: a.cogs + c.cogs,
      grossProfit: a.grossProfit + c.grossProfit,
      opex: a.opex + c.opex,
      workforceDelta: a.workforceDelta + c.workforceDelta,
      operatingIncome: a.operatingIncome + c.operatingIncome,
    }),
    { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, workforceDelta: 0, operatingIncome: 0 },
  )

  return { months, columns, total }
}

/** Sum of trailing-month actuals for the TTM reference column. */
export interface MonthlyActual {
  month: string
  revenue: number
  cogs: number
  opex: number
  operatingIncome: number
}

export function ttmActualTotals(actuals: MonthlyActual[]): Omit<TtmColumn, 'month' | 'workforceDelta' | 'grossProfit'> & { grossProfit: number } {
  const t = actuals.reduce(
    (a, m) => ({
      revenue: a.revenue + m.revenue,
      cogs: a.cogs + m.cogs,
      opex: a.opex + m.opex,
      operatingIncome: a.operatingIncome + m.operatingIncome,
    }),
    { revenue: 0, cogs: 0, opex: 0, operatingIncome: 0 },
  )
  return { ...t, grossProfit: t.revenue - t.cogs }
}
