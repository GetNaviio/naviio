import { projectOpexSeries, startOtherOpex } from '@/lib/forecasting/opex'

describe('startOtherOpex', () => {
  it('carves current marketing spend out of total opex', () => {
    expect(startOtherOpex(100_000, 20_000)).toBe(80_000)
  })

  it('floors at 0 when marketing exceeds total opex', () => {
    expect(startOtherOpex(10_000, 25_000)).toBe(0)
  })
})

describe('projectOpexSeries — other opex compounds', () => {
  it('with no new MRR, opex is pure other-opex growth (no-acquisition baseline)', () => {
    // newMrr = 0 every month → S&M = 0 → opex == startOtherOpex × (1+g)^t.
    const series = projectOpexSeries({
      startOtherOpex: 80_000,
      otherOpexGrowthRate: 0.03,
      cac: 1_000,
      arpu: 500,
      newMrrSeries: [0, 0, 0, 0],
      horizon: 4,
    })
    expect(series).toEqual([
      Math.round(80_000 * 1.03 ** 0),
      Math.round(80_000 * 1.03 ** 1),
      Math.round(80_000 * 1.03 ** 2),
      Math.round(80_000 * 1.03 ** 3),
    ])
  })

  it('reconciles to flat opex when growth is 0 and there is no S&M', () => {
    const series = projectOpexSeries({
      startOtherOpex: 80_000,
      otherOpexGrowthRate: 0,
      cac: 1_000,
      arpu: 500,
      newMrrSeries: [0, 0, 0],
      horizon: 3,
    })
    expect(series).toEqual([80_000, 80_000, 80_000])
  })
})

describe('projectOpexSeries — S&M from new logos × CAC', () => {
  it('S&M = (newMrr / arpu) × cac added on top of other opex', () => {
    // No other-opex growth so we read S&M cleanly.
    // newMrr 5000, arpu 500 → 10 new logos; CAC 1000 → $10,000 S&M.
    const series = projectOpexSeries({
      startOtherOpex: 50_000,
      otherOpexGrowthRate: 0,
      cac: 1_000,
      arpu: 500,
      newMrrSeries: [5_000, 5_000],
      horizon: 2,
    })
    expect(series).toEqual([60_000, 60_000]) // 50k other + 10k S&M
  })

  it('S&M scales linearly with new MRR', () => {
    const base = { startOtherOpex: 0, otherOpexGrowthRate: 0, cac: 1_000, arpu: 500, horizon: 1 }
    const a = projectOpexSeries({ ...base, newMrrSeries: [5_000] })[0]  // 10 logos
    const b = projectOpexSeries({ ...base, newMrrSeries: [10_000] })[0] // 20 logos
    expect(b).toBe(a * 2)
  })

  it('S&M scales linearly with CAC', () => {
    const base = { startOtherOpex: 0, otherOpexGrowthRate: 0, arpu: 500, newMrrSeries: [5_000], horizon: 1 }
    const a = projectOpexSeries({ ...base, cac: 1_000 })[0]
    const b = projectOpexSeries({ ...base, cac: 2_000 })[0]
    expect(b).toBe(a * 2)
  })

  it('combines compounding other opex with per-month S&M', () => {
    // other grows 10%/mo; S&M from a growing new-MRR stream.
    const series = projectOpexSeries({
      startOtherOpex: 100_000,
      otherOpexGrowthRate: 0.1,
      cac: 1_000,
      arpu: 1_000,        // 1 logo per $1,000 new MRR
      newMrrSeries: [10_000, 20_000], // 10 then 20 logos → 10k then 20k S&M
      horizon: 2,
    })
    expect(series[0]).toBe(Math.round(100_000 * 1.1 ** 0 + 10_000))
    expect(series[1]).toBe(Math.round(100_000 * 1.1 ** 1 + 20_000))
  })
})

describe('projectOpexSeries — guards', () => {
  it('arpu = 0 guard: S&M is 0 incremental, falls back to pure other-opex growth', () => {
    const series = projectOpexSeries({
      startOtherOpex: 80_000,
      otherOpexGrowthRate: 0.02,
      cac: 1_000,
      arpu: 0,                       // can't convert new MRR → logos
      newMrrSeries: [5_000, 5_000],  // would be S&M, but no ARPU → 0
      horizon: 2,
    })
    expect(series).toEqual([
      Math.round(80_000 * 1.02 ** 0),
      Math.round(80_000 * 1.02 ** 1),
    ])
  })

  it('cac <= 0 yields no S&M', () => {
    const series = projectOpexSeries({
      startOtherOpex: 50_000,
      otherOpexGrowthRate: 0,
      cac: 0,
      arpu: 500,
      newMrrSeries: [5_000],
      horizon: 1,
    })
    expect(series).toEqual([50_000])
  })

  it('negative new MRR in a month adds no S&M (floored to 0 logos)', () => {
    const series = projectOpexSeries({
      startOtherOpex: 50_000,
      otherOpexGrowthRate: 0,
      cac: 1_000,
      arpu: 500,
      newMrrSeries: [-5_000, 5_000],
      horizon: 2,
    })
    expect(series[0]).toBe(50_000)             // no S&M from negative new MRR
    expect(series[1]).toBe(60_000)             // 50k + 10 logos × 1k
  })

  it('missing new-MRR entries beyond the series are treated as 0', () => {
    const series = projectOpexSeries({
      startOtherOpex: 10_000,
      otherOpexGrowthRate: 0,
      cac: 1_000,
      arpu: 500,
      newMrrSeries: [5_000],  // shorter than horizon
      horizon: 3,
    })
    expect(series).toEqual([20_000, 10_000, 10_000])
  })
})
