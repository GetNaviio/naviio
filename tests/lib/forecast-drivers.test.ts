import {
  projectDriverMonth,
  projectDriverSeries,
  newMrrSeriesFrom,
  deriveDrivers,
  type MrrDrivers,
} from '@/lib/forecasting/drivers'
import type { Waterfall } from '@/lib/metrics/mrr'

// A waterfall is the customer's real last-period MRR movement.
const wf = (over: Partial<Waterfall> = {}): Waterfall => ({
  startMrr: 1000,
  newMrr: 100,
  expansionMrr: 50,
  contractionMrr: 20,
  churnedMrr: 30,
  endMrr: 1100,
  netNewMrr: 100,
  ...over,
})

describe('projectDriverMonth', () => {
  it('applies expansion/contraction/churn to base and adds new MRR', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0.05,
      contractionRate: 0.02,
      churnRate: 0.03,
      newMrr: 100,
      newMrrGrowthRate: 0,
    }
    const m = projectDriverMonth(1000, drivers)
    // 1000 + 50 (exp) - 20 (contr) - 30 (churn) + 100 (new) = 1100
    expect(m.expansion).toBeCloseTo(50, 6)
    expect(m.contraction).toBeCloseTo(20, 6)
    expect(m.churn).toBeCloseTo(30, 6)
    expect(m.newMrr).toBe(100)
    expect(m.endMrr).toBeCloseTo(1100, 6)
  })

  it('base decays under pure churn (no growth)', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0,
      contractionRate: 0,
      churnRate: 0.1,
      newMrr: 0,
      newMrrGrowthRate: 0,
    }
    const m = projectDriverMonth(1000, drivers)
    expect(m.endMrr).toBeCloseTo(900, 6) // lost 10%
  })

  it('base grows under expansion + new with no loss', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0.04,
      contractionRate: 0,
      churnRate: 0,
      newMrr: 200,
      newMrrGrowthRate: 0,
    }
    const m = projectDriverMonth(1000, drivers)
    expect(m.endMrr).toBeCloseTo(1240, 6) // +40 expansion +200 new
  })

  it('caps combined contraction + churn at the available base (no negative)', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0,
      contractionRate: 0.8,
      churnRate: 0.8, // 160% loss would overshoot
      newMrr: 0,
      newMrrGrowthRate: 0,
    }
    const m = projectDriverMonth(1000, drivers)
    expect(m.endMrr).toBeCloseTo(0, 6)
    expect(m.contraction + m.churn).toBeCloseTo(1000, 6)
  })
})

describe('projectDriverSeries', () => {
  it('compounds the existing base and grows new MRR each month', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0,
      contractionRate: 0,
      churnRate: 0.1,
      newMrr: 100,
      newMrrGrowthRate: 0,
    }
    const series = projectDriverSeries(1000, drivers, 3)
    // m1: 1000*0.9 + 100 = 1000
    // m2: 1000*0.9 + 100 = 1000  (steady state at this churn/new mix)
    expect(series).toEqual([1000, 1000, 1000])
  })

  it('new MRR compounds at newMrrGrowthRate', () => {
    const drivers: MrrDrivers = {
      expansionRate: 0,
      contractionRate: 0,
      churnRate: 0, // freeze the base so we isolate new MRR growth
      newMrr: 100,
      newMrrGrowthRate: 0.5,
    }
    const series = projectDriverSeries(0, drivers, 3)
    // m1 new=100 → 100; m2 new=150 → 250; m3 new=225 → 475
    expect(series).toEqual([100, 250, 475])
  })

  it('returns the requested horizon length', () => {
    const drivers = deriveDrivers(wf())
    expect(projectDriverSeries(1000, drivers, 12)).toHaveLength(12)
  })
})

describe('newMrrSeriesFrom', () => {
  it('emits the new-MRR stream growing at newMrrGrowthRate (opex source of truth)', () => {
    // Same stream the cohort/flat paths spawn each month — what opex consumes.
    expect(newMrrSeriesFrom(100, 0.5, 3)).toEqual([100, 150, 225])
  })

  it('is flat when growth is 0', () => {
    expect(newMrrSeriesFrom(100, 0, 3)).toEqual([100, 100, 100])
  })

  it('floors negative new MRR to 0', () => {
    expect(newMrrSeriesFrom(-50, 0.1, 2)).toEqual([0, 0])
  })

  it('returns the requested horizon length', () => {
    expect(newMrrSeriesFrom(100, 0.05, 12)).toHaveLength(12)
  })
})

describe('deriveDrivers', () => {
  it('derives rates relative to starting MRR and keeps new MRR absolute', () => {
    const d = deriveDrivers(wf())
    expect(d.expansionRate).toBeCloseTo(0.05, 6) // 50/1000
    expect(d.contractionRate).toBeCloseTo(0.02, 6) // 20/1000
    expect(d.churnRate).toBeCloseTo(0.03, 6) // 30/1000
    expect(d.newMrr).toBe(100)
  })

  it('reconciles: one driver month from the waterfall reproduces its endMrr', () => {
    // With multipliers of 1, projecting one month off the SAME starting MRR the
    // movement acted on must reproduce the observed end MRR.
    const w = wf()
    const d = deriveDrivers(w)
    const m = projectDriverMonth(w.startMrr, d)
    expect(m.endMrr).toBeCloseTo(w.endMrr, 6)
  })

  it('applies bear tilt: less growth, more loss', () => {
    const d = deriveDrivers(wf(), { growthMultiplier: 0.5, churnMultiplier: 1.3 })
    expect(d.expansionRate).toBeCloseTo(0.05 * 0.5, 6)
    expect(d.newMrr).toBeCloseTo(100 * 0.5, 6)
    expect(d.churnRate).toBeCloseTo(0.03 * 1.3, 6)
    expect(d.contractionRate).toBeCloseTo(0.02 * 1.3, 6)
  })

  it('applies bull tilt: more growth, less loss', () => {
    const d = deriveDrivers(wf(), { growthMultiplier: 1.5, churnMultiplier: 0.7 })
    expect(d.expansionRate).toBeCloseTo(0.05 * 1.5, 6)
    expect(d.newMrr).toBeCloseTo(100 * 1.5, 6)
    expect(d.churnRate).toBeCloseTo(0.03 * 0.7, 6)
  })

  it('handles zero starting MRR without dividing by zero', () => {
    const d = deriveDrivers(wf({ startMrr: 0, expansionMrr: 0, contractionMrr: 0, churnedMrr: 0, newMrr: 500 }))
    expect(d.expansionRate).toBe(0)
    expect(d.contractionRate).toBe(0)
    expect(d.churnRate).toBe(0)
    expect(d.newMrr).toBe(500)
  })

  it('bull case projects above the base case from real drivers', () => {
    const w = wf()
    const base = projectDriverSeries(w.startMrr, deriveDrivers(w, { growthMultiplier: 1, churnMultiplier: 1 }), 6)
    const bull = projectDriverSeries(w.startMrr, deriveDrivers(w, { growthMultiplier: 1.5, churnMultiplier: 0.7 }), 6)
    const bear = projectDriverSeries(w.startMrr, deriveDrivers(w, { growthMultiplier: 0.5, churnMultiplier: 1.3 }), 6)
    expect(bull[5]).toBeGreaterThan(base[5])
    expect(bear[5]).toBeLessThan(base[5])
  })
})
