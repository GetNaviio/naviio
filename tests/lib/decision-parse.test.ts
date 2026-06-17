/**
 * Natural-language → decision intent. Guards that a typed question routes to the
 * right template and extracts only the numbers the user actually stated.
 */
import { parseDecisionQuestion, parseMoney } from '@/lib/decisions/parse'

describe('parseMoney', () => {
  it('reads $, suffixes, and large bare numbers — but not small bare numbers', () => {
    expect(parseMoney('$240k lease')).toEqual([240000])
    expect(parseMoney('$1.42M cash')).toEqual([1_420_000])
    expect(parseMoney('$180,000 machine')).toEqual([180000])
    expect(parseMoney('15 treatments at 8%')).toEqual([])   // 15 and 8 are not money
  })
})

describe('parseDecisionQuestion', () => {
  it('routes the lease question to affordability', () => {
    const r = parseDecisionQuestion('Can we afford this $240k lease within the next 3 months?')
    expect(r.template).toBe('affordability')
    expect(r.params.amount).toBe(240000)
    expect(r.params.horizonMonths).toBe(3)
    expect(r.missing).toHaveLength(0)
  })

  it('routes the equipment-financing question to capex and asks for unit economics', () => {
    const r = parseDecisionQuestion('Is an 8% APR financing deal on this $180,000 laser machine a good deal?')
    expect(r.template).toBe('capex')
    expect(r.params.price).toBe(180000)
    expect(r.params.apr).toBeCloseTo(0.08, 4)
    expect(r.missing).toEqual(expect.arrayContaining(['avgRevenuePerUnit', 'grossMarginPct', 'unitsPerMonth']))
  })

  it('routes a board/runway question to runway_path with no missing params', () => {
    const r = parseDecisionQuestion('how should we think about runway, headcount, and path to profitability?')
    expect(r.template).toBe('runway_path')
    expect(r.missing).toHaveLength(0)
  })

  it('falls back to affordability when only an amount is present', () => {
    const r = parseDecisionQuestion('do we have room for a $50,000 spend')
    expect(r.template).toBe('affordability')
    expect(r.params.amount).toBe(50000)
  })
})
