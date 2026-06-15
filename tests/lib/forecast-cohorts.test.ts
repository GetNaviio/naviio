import {
  deriveRetentionCurve,
  tiltCurve,
  projectCohortSeries,
  projectCohortSeriesWithExpansion,
  hasSufficientCohortData,
  type CohortSeries,
} from '@/lib/forecasting/cohorts'

// A cohort series mirrors `cohortRetention` output: base = M0 MRR, points by age.
const cohort = (cohortName: string, base: number, pcts: number[]): CohortSeries => ({
  cohort: cohortName,
  base,
  points: pcts.map((pct, offset) => ({ offset, mrr: (base * pct) / 100, pct })),
})

describe('deriveRetentionCurve', () => {
  it('converts a cumulative-retention curve into per-step survival rates', () => {
    // One cohort: 100% → 90% → 81% (a constant 0.9 monthly survival).
    const c = cohort('2026-01', 1000, [100, 90, 81])
    const curve = deriveRetentionCurve([c])
    expect(curve.maxOffset).toBe(2)
    expect(curve.step[0]).toBeCloseTo(0.9, 6) // 90/100
    expect(curve.step[1]).toBeCloseTo(0.9, 6) // 81/90
  })

  it('all step survival rates are clamped to [0, 1]', () => {
    // A cohort that "recovers" (110% at M1) must not yield a step > 1.
    const c = cohort('2026-01', 1000, [100, 110, 90])
    const curve = deriveRetentionCurve([c])
    for (const r of curve.step) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })

  it('blends across cohorts exposure-weighted at each offset', () => {
    // Two cohorts both reach offset 1; aggregate retained / aggregate base.
    const a = cohort('2026-01', 1000, [100, 80]) // retains 800
    const b = cohort('2026-02', 1000, [100, 90]) // retains 900
    const curve = deriveRetentionCurve([a, b])
    // step[0] = (800 + 900) / (1000 + 1000) = 0.85
    expect(curve.step[0]).toBeCloseTo(0.85, 6)
  })

  it('falls back to the last known step for sparse ages', () => {
    const c = cohort('2026-01', 1000, [100, 90, 81]) // step 0.9 throughout
    const curve = deriveRetentionCurve([c])
    // Beyond maxOffset, fallback step = last known = 0.9
    expect(curve.fallbackStep).toBeCloseTo(0.9, 6)
  })

  it('uses defaultStep when there is no aging data at all', () => {
    const c = cohort('2026-01', 1000, [100]) // only M0
    const curve = deriveRetentionCurve([c], 0.95)
    expect(curve.fallbackStep).toBeCloseTo(0.95, 6)
  })
})

describe('projectCohortSeries — monotonic decay', () => {
  it('a single cohort with a known curve decays exactly', () => {
    const c = cohort('2026-01', 1000, [100, 90, 81]) // constant 0.9 survival
    const curve = deriveRetentionCurve([c])
    // No new MRR — existing base (currently 810 at age 2) ages: ×0.9 each step.
    const series = projectCohortSeries([c], 0, 0, curve, 3)
    expect(series[0]).toBe(Math.round(810 * 0.9)) // 729
    expect(series[1]).toBe(Math.round(810 * 0.9 * 0.9)) // 656
    expect(series[2]).toBe(Math.round(810 * 0.9 * 0.9 * 0.9)) // 590
  })

  it('with no new MRR the base only shrinks (monotonic non-increasing)', () => {
    const c = cohort('2026-01', 1000, [100, 90, 81])
    const curve = deriveRetentionCurve([c])
    const series = projectCohortSeries([c], 0, 0, curve, 6)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeLessThanOrEqual(series[i - 1])
    }
  })

  it('new MRR enters as a fresh age-0 cohort and then decays', () => {
    // Flat curve (no decay) so we can read the new-cohort accumulation cleanly.
    const c = cohort('2026-01', 1000, [100, 100]) // survival 1.0
    const curve = deriveRetentionCurve([c])
    // Existing base currently 1000 (age 1). Add 100 new MRR/month, no decay.
    const series = projectCohortSeries([c], 100, 0, curve, 3)
    expect(series).toEqual([1100, 1200, 1300])
  })
})

describe('tiltCurve', () => {
  it('a churnMultiplier of 1 leaves the curve unchanged', () => {
    const c = cohort('2026-01', 1000, [100, 90, 81])
    const curve = deriveRetentionCurve([c])
    const same = tiltCurve(curve, 1)
    expect(same.step).toEqual(curve.step)
  })

  it('a higher churnMultiplier retains less (bear)', () => {
    const c = cohort('2026-01', 1000, [100, 90]) // step 0.9, loss 0.1
    const curve = deriveRetentionCurve([c])
    const bear = tiltCurve(curve, 1.3) // loss 0.13 → survival 0.87
    expect(bear.step[0]).toBeCloseTo(0.87, 6)
  })

  it('a lower churnMultiplier retains more (bull), clamped to 1', () => {
    const c = cohort('2026-01', 1000, [100, 90])
    const curve = deriveRetentionCurve([c])
    const bull = tiltCurve(curve, 0.7) // loss 0.07 → survival 0.93
    expect(bull.step[0]).toBeCloseTo(0.93, 6)
  })
})

describe('expansion layering (no double-counting of churn)', () => {
  it('expansion adds on the retained base without touching the curve', () => {
    // Flat curve (survival 1.0) isolates expansion. Base 1000 (age 1), 5% exp.
    const c = cohort('2026-01', 1000, [100, 100])
    const curve = deriveRetentionCurve([c])
    const series = projectCohortSeriesWithExpansion([c], 0, 0, 0.05, curve, 2)
    // m1: 1000 (decayed, ×1) + 50 expansion = 1050
    // m2: base 1000 + first exp 50 = 1050 start; decayed ×1 = 1050; +0.05*1050 = 52.5 → 1102.5 → 1103
    expect(series[0]).toBe(1050)
    expect(series[1]).toBe(Math.round(1050 + 0.05 * 1050))
  })

  it('with zero expansion it matches the plain cohort projection', () => {
    const c = cohort('2026-01', 1000, [100, 90, 81])
    const curve = deriveRetentionCurve([c])
    // Same new-MRR + growth on both, zero expansion → identical to plain decay.
    const plain = projectCohortSeries([c], 80, 0.05, curve, 6)
    const withExp = projectCohortSeriesWithExpansion([c], 80, 0.05, 0, curve, 6)
    expect(withExp).toEqual(plain)
  })
})

describe('reconciliation with pass-1 flat churn', () => {
  it('a flat (1 - churn) curve reproduces flat-churn decay of the base', () => {
    // Flat 3% churn → survival 0.97 at every age. Derive such a curve from a
    // cohort that retains exactly 97% each step.
    const c = cohort('2026-01', 1000, [100, 97, 94.09]) // 1, 0.97, 0.97^2
    const curve = deriveRetentionCurve([c])
    expect(curve.step[0]).toBeCloseTo(0.97, 4)
    expect(curve.step[1]).toBeCloseTo(0.97, 4)

    // Existing base currently 940.9 (age 2); no new MRR, no expansion. Each month
    // it must lose exactly 3% — identical to a pass-1 flat 3% churn on the base.
    const series = projectCohortSeries([c], 0, 0, curve, 3)
    let base = 1000 * 0.97 * 0.97 // current installed = 940.9
    const expected: number[] = []
    for (let i = 0; i < 3; i++) {
      base = base * 0.97
      expected.push(Math.round(base))
    }
    expect(series).toEqual(expected)
  })
})

describe('hasSufficientCohortData', () => {
  it('true when a cohort has an offset≥1 observation', () => {
    expect(hasSufficientCohortData([cohort('2026-01', 1000, [100, 90])])).toBe(true)
  })

  it('false when every cohort only has its M0 point', () => {
    expect(hasSufficientCohortData([cohort('2026-01', 1000, [100])])).toBe(false)
  })

  it('false for an empty cohort table', () => {
    expect(hasSufficientCohortData([])).toBe(false)
  })
})
