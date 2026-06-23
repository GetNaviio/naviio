import {
  scoreGrossMargin, scoreProfitability, scoreRevenueGrowth, scoreLiquidity,
  GROSS_MARGIN_TARGET, NET_MARGIN_TARGET, REVENUE_GROWTH_TARGET, MONTHS_OF_CASH_TARGET,
} from '@/lib/metrics/scoring'

describe('per-industry score benchmarks', () => {
  it('grades the SAME gross margin differently by industry', () => {
    // 35% gross margin: excellent for manufacturing (target 30), weak for SaaS (target 80)
    const mfg = scoreGrossMargin(35, 'manufacturing')!
    const saas = scoreGrossMargin(35, 'saas')!
    expect(mfg).toBeGreaterThan(80)
    expect(saas).toBeLessThan(45)
    expect(mfg).toBeGreaterThan(saas)
  })

  it('a business at its industry target scores ~85 on gross margin', () => {
    expect(scoreGrossMargin(GROSS_MARGIN_TARGET.restaurant, 'restaurant')).toBe(85)
    expect(scoreGrossMargin(GROSS_MARGIN_TARGET.trades, 'trades')).toBe(85)
    expect(scoreGrossMargin(GROSS_MARGIN_TARGET.saas, 'saas')).toBe(85)
  })

  it('net margin is graded against the industry target (10% is great for a restaurant)', () => {
    expect(scoreProfitability(10, 'restaurant')).toBe(82) // == target
    // same 10% for an agency (target 20%) scores lower — only halfway to target
    expect(scoreProfitability(10, 'agency')!).toBeLessThan(scoreProfitability(10, 'restaurant')!)
  })

  it('tolerates break-even (0%) and small losses, scaled to target', () => {
    expect(scoreProfitability(0, 'saas')).toBe(42)
    expect(scoreProfitability(NET_MARGIN_TARGET.nonprofit, 'nonprofit')).toBe(82) // 3% surplus is healthy
  })

  it('falls back to a generic target when no industry is given', () => {
    expect(scoreGrossMargin(45, null)).toBe(85) // generic target 45
    expect(scoreGrossMargin(45)).toBe(85)
  })

  it('revenue growth: 3% MoM is great for a restaurant, sub-par for SaaS', () => {
    expect(scoreRevenueGrowth(3, 'restaurant')!).toBeGreaterThan(scoreRevenueGrowth(3, 'saas')!)
    // a business at its growth target scores ~82
    expect(scoreRevenueGrowth(REVENUE_GROWTH_TARGET.saas, 'saas')).toBe(82)
    expect(scoreRevenueGrowth(REVENUE_GROWTH_TARGET.restaurant, 'restaurant')).toBe(82)
  })

  it('months of cash: 6mo is strong for a restaurant, thin for a SaaS startup', () => {
    expect(scoreLiquidity(6, 'restaurant')!).toBeGreaterThan(scoreLiquidity(6, 'saas')!)
    expect(scoreLiquidity(MONTHS_OF_CASH_TARGET.restaurant, 'restaurant')).toBe(75) // == target
    expect(scoreLiquidity(Infinity, 'saas')).toBe(95) // cash-positive always strong
    expect(scoreLiquidity(null, 'saas')).toBeNull()
  })
})
