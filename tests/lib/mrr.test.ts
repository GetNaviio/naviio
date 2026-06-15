import { mrrWaterfall, nrr, grr, cohortRetention, type SubMrr } from '@/lib/metrics/mrr'

describe('mrrWaterfall', () => {
  const prev: SubMrr[] = [
    { subscriptionId: 'a', mrr: 100 },
    { subscriptionId: 'b', mrr: 200 },
    { subscriptionId: 'c', mrr: 50 },
  ]
  const curr: SubMrr[] = [
    { subscriptionId: 'a', mrr: 150 }, // expansion +50
    { subscriptionId: 'b', mrr: 120 }, // contraction -80
    // c churned (-50)
    { subscriptionId: 'd', mrr: 90 },  // new +90
  ]

  it('decomposes the movement correctly', () => {
    const w = mrrWaterfall(prev, curr)
    expect(w.startMrr).toBe(350)
    expect(w.newMrr).toBe(90)
    expect(w.expansionMrr).toBe(50)
    expect(w.contractionMrr).toBe(80)
    expect(w.churnedMrr).toBe(50)
    expect(w.endMrr).toBe(360)
    expect(w.netNewMrr).toBe(10) // 90 + 50 - 80 - 50
  })

  it('endMrr reconciles: start + net = end', () => {
    const w = mrrWaterfall(prev, curr)
    expect(w.startMrr + w.netNewMrr).toBeCloseTo(w.endMrr, 2)
  })

  it('computes NRR from existing customers only (excludes new)', () => {
    const w = mrrWaterfall(prev, curr)
    // (350 + 50 - 80 - 50) / 350 = 77.14%
    expect(nrr(w)).toBeCloseTo(77.14, 1)
  })

  it('GRR excludes expansion and is ≤ 100', () => {
    const w = mrrWaterfall(prev, curr)
    // (350 - 80 - 50) / 350 = 62.86%
    expect(grr(w)).toBeCloseTo(62.86, 1)
  })

  it('NRR is null with no starting MRR', () => {
    expect(nrr(mrrWaterfall([], curr))).toBeNull()
  })

  it('all-new with no prior is 100% new, no churn', () => {
    const w = mrrWaterfall([], [{ subscriptionId: 'x', mrr: 500 }])
    expect(w.newMrr).toBe(500)
    expect(w.churnedMrr).toBe(0)
    expect(w.netNewMrr).toBe(500)
  })
})

describe('cohortRetention', () => {
  const rows = [
    // Jan cohort: starts at 1000, decays
    { period: '2026-01', cohortMonth: '2026-01', mrr: 1000 },
    { period: '2026-02', cohortMonth: '2026-01', mrr: 950 },
    { period: '2026-03', cohortMonth: '2026-01', mrr: 900 },
    // Feb cohort: starts at 500
    { period: '2026-02', cohortMonth: '2026-02', mrr: 500 },
    { period: '2026-03', cohortMonth: '2026-02', mrr: 480 },
  ]

  it('computes retention % off each cohort base', () => {
    const c = cohortRetention(rows)
    const jan = c.find((x) => x.cohort === '2026-01')!
    expect(jan.base).toBe(1000)
    expect(jan.points).toEqual([
      { offset: 0, mrr: 1000, pct: 100 },
      { offset: 1, mrr: 950, pct: 95 },
      { offset: 2, mrr: 900, pct: 90 },
    ])
    const feb = c.find((x) => x.cohort === '2026-02')!
    expect(feb.points[1]).toEqual({ offset: 1, mrr: 480, pct: 96 })
  })
})
