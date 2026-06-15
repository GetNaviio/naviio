import { buildTtmForecast, ttmActualTotals, type TtmAssumptions } from '@/lib/model/ttm'
import type { PlannedRole } from '@/lib/model/workforce'

const A: TtmAssumptions = {
  startRevenue: 100_000,
  growth: 0.05,
  grossMargin: 0.7,
  startOpex: 60_000,
  opexGrowth: 0.02,
}

describe('buildTtmForecast', () => {
  it('produces 12 month columns anchored at the given month', () => {
    const t = buildTtmForecast('2026-06', A)
    expect(t.months).toHaveLength(12)
    expect(t.months[0]).toBe('2026-06')
    expect(t.months[11]).toBe('2027-05')
  })

  it('reconciles exactly in every column: GP + COGS = Revenue, GP − OpEx = OI', () => {
    const t = buildTtmForecast('2026-06', A)
    for (const c of t.columns) {
      expect(c.grossProfit + c.cogs).toBe(c.revenue)
      expect(c.grossProfit - c.opex).toBe(c.operatingIncome)
    }
  })

  it('compounds revenue at the growth assumption', () => {
    const t = buildTtmForecast('2026-06', A)
    expect(t.columns[0].revenue).toBe(100_000)
    expect(t.columns[1].revenue).toBe(105_000)
    expect(t.columns[2].revenue).toBe(Math.round(100_000 * 1.05 ** 2))
  })

  it('totals equal the sum of the columns', () => {
    const t = buildTtmForecast('2026-06', A)
    expect(t.total.revenue).toBe(t.columns.reduce((s, c) => s + c.revenue, 0))
    expect(t.total.operatingIncome).toBe(t.columns.reduce((s, c) => s + c.operatingIncome, 0))
  })

  it('adds only the workforce DELTA vs the anchor month (baseline payroll is already in opex)', () => {
    const existing: PlannedRole = {
      title: 'Existing', headcount: 2, monthlySalary: 10_000, loadedPct: 25, startMonth: '2025-01', endMonth: null,
    }
    const futureHire: PlannedRole = {
      title: 'New AE', headcount: 1, monthlySalary: 8_000, loadedPct: 25, startMonth: '2026-09', endMonth: null,
    }
    const t = buildTtmForecast('2026-06', A, [existing, futureHire])

    // Months before the hire: no delta — the existing team is in the run-rate.
    expect(t.columns[0].workforceDelta).toBe(0)
    expect(t.columns[1].workforceDelta).toBe(0)
    // From Sep (index 3): +10,000 loaded
    expect(t.columns[3].workforceDelta).toBe(10_000)
    expect(t.columns[3].opex).toBe(Math.round(60_000 * 1.02 ** 3) + 10_000)
  })

  it('a planned departure produces a negative delta', () => {
    const leaving: PlannedRole = {
      title: 'Contractor', headcount: 1, monthlySalary: 12_000, loadedPct: 0, startMonth: '2025-01', endMonth: '2026-08',
    }
    const t = buildTtmForecast('2026-06', A, [leaving])
    expect(t.columns[0].workforceDelta).toBe(0) // still active at anchor
    expect(t.columns[3].workforceDelta).toBe(-12_000) // gone from Sep
  })
})

describe('ttmActualTotals', () => {
  it('sums trailing actuals and derives gross profit', () => {
    const t = ttmActualTotals([
      { month: '2026-04', revenue: 100, cogs: 30, opex: 50, operatingIncome: 20 },
      { month: '2026-05', revenue: 200, cogs: 60, opex: 100, operatingIncome: 40 },
    ])
    expect(t).toEqual({ revenue: 300, cogs: 90, opex: 150, operatingIncome: 60, grossProfit: 210 })
  })

  it('handles an empty history', () => {
    expect(ttmActualTotals([]).revenue).toBe(0)
  })
})
