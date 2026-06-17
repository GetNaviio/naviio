/**
 * Navi Decision Engine — math correctness.
 *
 * These guard the "compute, don't hallucinate" promise: the numbers Navi shows
 * a founder ("yes, you can afford it" / "payback in ~9 months") come from here,
 * so the arithmetic must be exact and the edge cases honest.
 */
import {
  amortizedMonthlyPayment,
  affordabilityCheck,
  capexAnalysis,
  breakevenUnits,
  runwayPath,
  scenarioCompare,
} from '@/lib/decisions/engine'
import type { CapexInput } from '@/lib/decisions/types'

describe('amortizedMonthlyPayment', () => {
  it('is straight-line at 0% APR', () => {
    expect(amortizedMonthlyPayment(12000, 0, 12)).toBe(1000)
  })
  it('matches the standard amortization formula', () => {
    // $100k at 8% APR over 36 months ≈ $3,133.64/mo
    expect(amortizedMonthlyPayment(100000, 0.08, 36)).toBeCloseTo(3133.64, 1)
  })
  it('is 0 for a non-positive principal or term', () => {
    expect(amortizedMonthlyPayment(0, 0.08, 36)).toBe(0)
    expect(amortizedMonthlyPayment(50000, 0.08, 0)).toBe(0)
  })
})

describe('affordabilityCheck', () => {
  it('approves a one-time outlay that stays above the floor (the lease)', () => {
    // $1.42M cash, +$? net, $240k one-time over 3 months, floor $500k.
    const r = affordabilityCheck({
      cashBalance: 1_420_000, monthlyNet: 0, oneTime: 240_000,
      horizonMonths: 3, minCashFloor: 500_000,
    })
    expect(r.canAfford).toBe(true)
    expect(r.breachesFloor).toBe(false)
    expect(r.projectedBalance).toBe(1_180_000)   // 1.42M - 240k
    expect(r.lowestBalance).toBe(1_180_000)
    expect(r.series).toHaveLength(4)             // month 0..3
  })

  it('rejects when a recurring cost breaches the floor', () => {
    const r = affordabilityCheck({
      cashBalance: 600_000, monthlyNet: -50_000, recurringMonthly: 30_000,
      horizonMonths: 6, minCashFloor: 400_000,
    })
    expect(r.canAfford).toBe(false)
    expect(r.breachesFloor).toBe(true)
    expect(r.breachMonth).not.toBeNull()
    expect(r.breachMonth!).toBeLessThanOrEqual(6)
  })

  it('applies the one-time outlay only in month 1', () => {
    const r = affordabilityCheck({ cashBalance: 100_000, monthlyNet: 0, oneTime: 10_000, horizonMonths: 3, minCashFloor: 0 })
    expect(r.series[1].value).toBe(90_000)
    expect(r.series[2].value).toBe(90_000)
    expect(r.series[3].value).toBe(90_000)
  })
})

describe('capexAnalysis', () => {
  it('computes break-even and payback for a cash purchase (med-spa laser)', () => {
    const r = capexAnalysis({
      price: 180_000, avgRevenuePerUnit: 2000, grossMarginPct: 0.68, unitsPerMonth: 15,
    })
    expect(r.financed).toBe(false)
    expect(r.contributionPerUnit).toBe(1360)            // 2000 * 0.68
    expect(r.monthlyContribution).toBe(20_400)          // 1360 * 15
    expect(r.breakEvenUnits).toBe(133)                  // ceil(180000 / 1360)
    expect(r.paybackMonths).toBeCloseTo(8.82, 1)        // 180000 / 20400
    expect(r.monthlyPayment).toBe(0)
  })

  it('adds finance cost to the recoverable total when financed', () => {
    const r = capexAnalysis({
      price: 180_000, apr: 0.08, termMonths: 36,
      avgRevenuePerUnit: 2000, grossMarginPct: 0.68, unitsPerMonth: 15,
    })
    expect(r.financed).toBe(true)
    expect(r.monthlyPayment).toBeGreaterThan(0)
    expect(r.totalFinanceCost).toBeGreaterThan(0)
    expect(r.totalCost).toBeGreaterThan(180_000)        // price + interest
    expect(r.breakEvenUnits).toBeGreaterThan(133)       // costs more, so more units
    expect(r.netMonthlyCashEffect).toBe(Math.round((r.monthlyContribution - r.monthlyPayment) * 100) / 100)
  })

  it('reports no payback when units generate no contribution', () => {
    const r = capexAnalysis({ price: 50_000, avgRevenuePerUnit: 2000, grossMarginPct: 0.5, unitsPerMonth: 0 })
    expect(r.paybackMonths).toBeNull()
  })
})

describe('breakevenUnits', () => {
  it('divides fixed cost by contribution and rounds up', () => {
    expect(breakevenUnits(10_000, 1360)).toBe(8)   // ceil(10000/1360)
    expect(breakevenUnits(10_000, 0)).toBe(Infinity)
  })
})

describe('runwayPath', () => {
  it('reports the month cash runs out under steady burn', () => {
    const r = runwayPath({ cashBalance: 300_000, monthlyNet: -100_000, horizonMonths: 12 })
    expect(r.runwayMonths).toBe(3)                 // 300k / 100k
    expect(r.profitabilityMonth).toBeNull()
  })

  it('never depletes when cash-positive', () => {
    const r = runwayPath({ cashBalance: 300_000, monthlyNet: 20_000, horizonMonths: 12 })
    expect(r.runwayMonths).toBeNull()
    expect(r.profitabilityMonth).toBe(1)
    expect(r.endingCash).toBeGreaterThan(300_000)
  })

  it('turns profitable when growth lifts net above zero', () => {
    const r = runwayPath({ cashBalance: 500_000, monthlyNet: -50_000, monthlyNetImprovement: 10_000, horizonMonths: 24 })
    expect(r.profitabilityMonth).not.toBeNull()
    expect(r.profitabilityMonth!).toBeGreaterThan(1)
  })

  it('counts added hire cost against runway', () => {
    const base = runwayPath({ cashBalance: 600_000, monthlyNet: -50_000, horizonMonths: 24 })
    const withHires = runwayPath({ cashBalance: 600_000, monthlyNet: -50_000, addedMonthlyCost: 50_000, horizonMonths: 24 })
    expect(withHires.runwayMonths!).toBeLessThan(base.runwayMonths!)
  })
})

describe('scenarioCompare', () => {
  it('runs the analyzer across variants (10/15/20 units per month)', () => {
    const base: CapexInput = { price: 180_000, avgRevenuePerUnit: 2000, grossMarginPct: 0.68, unitsPerMonth: 10 }
    const out = scenarioCompare(base, [{ unitsPerMonth: 10 }, { unitsPerMonth: 15 }, { unitsPerMonth: 20 }], capexAnalysis)
    expect(out).toHaveLength(3)
    // More volume → faster payback.
    expect(out[2].result.paybackMonths!).toBeLessThan(out[0].result.paybackMonths!)
  })
})
