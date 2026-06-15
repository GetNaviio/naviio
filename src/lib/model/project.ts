/**
 * Driver-based monthly P&L projection — the "model" users run and export.
 * Pure + side-effect free so it's unit-tested and mirrors the Excel formulas
 * exactly (revenue compounds at the growth rate; gross profit = revenue × margin;
 * opex compounds at its own rate; operating income = gross profit − opex).
 */
export interface ProjectionInput {
  months: number
  startRevenue: number // month-1 revenue, $
  monthlyGrowth: number // decimal, e.g. 0.05 = +5%/mo
  grossMargin: number // decimal, e.g. 0.70 = 70%
  startOpex: number // month-1 operating expense, $
  opexGrowth: number // decimal, e.g. 0.02
}

export interface ProjectionMonth {
  month: number // 1-based
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  operatingIncome: number
}

const round = (n: number) => Math.round(n)

export function projectModel(input: ProjectionInput): ProjectionMonth[] {
  const out: ProjectionMonth[] = []
  let revenue = input.startRevenue
  let opex = input.startOpex
  for (let i = 1; i <= Math.max(0, input.months); i++) {
    if (i > 1) {
      revenue = revenue * (1 + input.monthlyGrowth)
      opex = opex * (1 + input.opexGrowth)
    }
    // Round revenue and grossProfit, then DERIVE the dependent lines from the
    // rounded values — rounding each line independently breaks the identities
    // (grossProfit + cogs === revenue, grossProfit - opex === operatingIncome)
    // by ±1, and a financial statement that doesn't reconcile is wrong.
    const rRevenue = round(revenue)
    const rGrossProfit = round(revenue * input.grossMargin)
    const rOpex = round(opex)
    out.push({
      month: i,
      revenue: rRevenue,
      cogs: rRevenue - rGrossProfit,
      grossProfit: rGrossProfit,
      opex: rOpex,
      operatingIncome: rGrossProfit - rOpex,
    })
  }
  return out
}

/** Convenience totals across the projection horizon. */
export function projectionTotals(rows: ProjectionMonth[]) {
  return rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      cogs: a.cogs + r.cogs,
      grossProfit: a.grossProfit + r.grossProfit,
      opex: a.opex + r.opex,
      operatingIncome: a.operatingIncome + r.operatingIncome,
    }),
    { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, operatingIncome: 0 },
  )
}
