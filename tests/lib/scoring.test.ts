import {
  band, scoreProfitability, scoreGrowth, scoreRetention, scoreUnitEconomics,
  scoreEfficiency, scoreLiquidity, overallScore, grade,
} from '@/lib/metrics/scoring'

describe('band', () => {
  it('clamps below/above and interpolates between', () => {
    const pts: [number, number][] = [[0, 0], [10, 100]]
    expect(band(-5, pts)).toBe(0)
    expect(band(15, pts)).toBe(100)
    expect(band(5, pts)).toBe(50)
  })
})

describe('dimension scorers', () => {
  it('return null for missing input', () => {
    expect(scoreProfitability(null)).toBeNull()
    expect(scoreGrowth(undefined)).toBeNull()
    expect(scoreRetention(NaN)).toBeNull()
  })
  it('score within 0–100 and rank sensibly', () => {
    expect(scoreProfitability(20)).toBe(82)
    expect(scoreProfitability(-20)).toBe(10)
    expect(scoreRetention(110)).toBe(85)
    expect(scoreUnitEconomics(5)).toBe(80)
    expect(scoreEfficiency(1.5)).toBe(88)
    expect(scoreGrowth(7)).toBe(82)
  })
  it('liquidity treats cash-positive (Infinity) as strong', () => {
    expect(scoreLiquidity(Infinity)).toBe(95)
    expect(scoreLiquidity(3)).toBe(25)
    expect(scoreLiquidity(18)).toBe(87)
    expect(scoreLiquidity(null)).toBeNull()
  })
})

describe('overallScore', () => {
  it('weighted-averages only available dimensions', () => {
    const parts = [
      { score: 80, weight: 1 },
      { score: 60, weight: 1 },
      { score: null, weight: 1 },   // ignored + reweighted
    ]
    expect(overallScore(parts)).toBe(70)
  })
  it('null when nothing is available', () => {
    expect(overallScore([{ score: null, weight: 1 }])).toBeNull()
  })
})

describe('grade', () => {
  it('maps scores to letters', () => {
    expect(grade(95).grade).toBe('A+')
    expect(grade(88).grade).toBe('A')
    expect(grade(72).grade).toBe('B−')
    expect(grade(62).grade).toBe('C')
    expect(grade(30).grade).toBe('F')
  })
})
