import { projectModel, projectionTotals } from '@/lib/model/project'

describe('projectModel', () => {
  it('month 1 uses the starting values (no growth yet)', () => {
    const [m1] = projectModel({ months: 1, startRevenue: 1000, monthlyGrowth: 0.1, grossMargin: 0.7, startOpex: 400, opexGrowth: 0.05 })
    expect(m1.revenue).toBe(1000)
    expect(m1.grossProfit).toBe(700)
    expect(m1.cogs).toBe(300)
    expect(m1.opex).toBe(400)
    expect(m1.operatingIncome).toBe(300) // 700 - 400
  })

  it('compounds revenue and opex over the horizon', () => {
    const rows = projectModel({ months: 3, startRevenue: 1000, monthlyGrowth: 0.1, grossMargin: 0.5, startOpex: 200, opexGrowth: 0.0 })
    expect(rows.map((r) => r.revenue)).toEqual([1000, 1100, 1210])
    expect(rows.map((r) => r.opex)).toEqual([200, 200, 200]) // 0% opex growth
    expect(rows[2].grossProfit).toBe(605) // 1210 * 0.5
    expect(rows[2].operatingIncome).toBe(405) // 605 - 200
  })

  it('gross profit + cogs always reconstruct revenue', () => {
    const rows = projectModel({ months: 6, startRevenue: 5000, monthlyGrowth: 0.03, grossMargin: 0.62, startOpex: 3000, opexGrowth: 0.01 })
    for (const r of rows) expect(r.grossProfit + r.cogs).toBe(r.revenue)
  })

  it('totals sum the horizon', () => {
    const rows = projectModel({ months: 2, startRevenue: 1000, monthlyGrowth: 0, grossMargin: 0.5, startOpex: 100, opexGrowth: 0 })
    const t = projectionTotals(rows)
    expect(t.revenue).toBe(2000)
    expect(t.grossProfit).toBe(1000)
    expect(t.operatingIncome).toBe(800) // (500-100)*2
  })

  it('handles a zero horizon', () => {
    expect(projectModel({ months: 0, startRevenue: 1000, monthlyGrowth: 0.1, grossMargin: 0.7, startOpex: 0, opexGrowth: 0 })).toEqual([])
  })
})
