import { mrrWaterfall, nrr, grr, grossMrrChurnRate, contractionRate, trailingGrossMrrChurn, cohortRetention, type SubMrr, type Waterfall } from '@/lib/metrics/mrr'

const wf = (over: Partial<Waterfall> = {}): Waterfall => ({
  startMrr: 1000, newMrr: 0, expansionMrr: 0, contractionMrr: 0, churnedMrr: 0, endMrr: 1000, netNewMrr: 0, ...over,
})

describe('revenue churn helpers (accountant-grade)', () => {
  it('grossMrrChurnRate = churnedMrr / startMrr (cancellation only)', () => {
    expect(grossMrrChurnRate(wf({ churnedMrr: 50 }))).toBe(5) // 50/1000
    expect(grossMrrChurnRate(wf({ startMrr: 0 }))).toBeNull()
  })
  it('contractionRate is reported separately from churn', () => {
    expect(contractionRate(wf({ contractionMrr: 30 }))).toBe(3)
  })
  it('reconciles with GRR: GRR = 100 − grossChurn − contraction', () => {
    const w = wf({ churnedMrr: 50, contractionMrr: 30 })
    expect(grr(w)).toBeCloseTo(100 - grossMrrChurnRate(w)! - contractionRate(w)!, 6)
  })
  it('trailingGrossMrrChurn averages the last N period-pairs, skipping empties', () => {
    const ws = [wf({ churnedMrr: 100 }), wf({ churnedMrr: 50 }), wf({ churnedMrr: 30 })] // 10%,5%,3%
    expect(trailingGrossMrrChurn(ws, 3)).toBeCloseTo((10 + 5 + 3) / 3, 4)
    expect(trailingGrossMrrChurn([], 3)).toBeNull()
  })
})

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

  it('matches per customer: swapping subscriptions nets flat, not churn + new (P1-9)', () => {
    // Same customer cust1 cancels sub s1 ($100) and signs sub s2 ($100).
    const p: SubMrr[] = [{ subscriptionId: 's1', customerId: 'cust1', mrr: 100 }]
    const c: SubMrr[] = [{ subscriptionId: 's2', customerId: 'cust1', mrr: 100 }]
    const w = mrrWaterfall(p, c)
    expect(w.churnedMrr).toBe(0)
    expect(w.newMrr).toBe(0)
    expect(w.netNewMrr).toBe(0)
  })

  it('per customer: net upgrade across two subs counts as expansion only', () => {
    // cust1: drop s1 $100, add s2 $150 → +$50 expansion, no churn/new.
    const p: SubMrr[] = [{ subscriptionId: 's1', customerId: 'cust1', mrr: 100 }]
    const c: SubMrr[] = [{ subscriptionId: 's2', customerId: 'cust1', mrr: 150 }]
    const w = mrrWaterfall(p, c)
    expect(w.expansionMrr).toBe(50)
    expect(w.churnedMrr).toBe(0)
    expect(w.newMrr).toBe(0)
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
