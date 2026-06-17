/**
 * Natural-language → decision intent. Guards that a typed question routes to the
 * right template and extracts only the numbers the user actually stated.
 */
import { parseDecisionQuestion, parseMoney, extractSlots, missingParams } from '@/lib/decisions/parse'

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

describe('multi-turn slot filling', () => {
  const missing = ['avgRevenuePerUnit', 'grossMarginPct', 'unitsPerMonth']

  it('fills all capex unit-economics from one reply', () => {
    const f = extractSlots('capex', missing, 'about $2,000 per treatment, 68% margin, 15 a month')
    expect(f.avgRevenuePerUnit).toBe(2000)
    expect(f.grossMarginPct).toBeCloseTo(0.68, 4)
    expect(f.unitsPerMonth).toBe(15)
    expect(missingParams('capex', { price: 180000, ...f })).toHaveLength(0)
  })

  it('fills capex slots piecemeal across turns', () => {
    const p: Record<string, unknown> = { price: 60000 }
    Object.assign(p, extractSlots('capex', missingParams('capex', p), '2500'))
    Object.assign(p, extractSlots('capex', missingParams('capex', p), '70%'))
    Object.assign(p, extractSlots('capex', missingParams('capex', p), '20'))
    expect(p.avgRevenuePerUnit).toBe(2500)
    expect(p.grossMarginPct).toBeCloseTo(0.70, 4)
    expect(p.unitsPerMonth).toBe(20)
    expect(missingParams('capex', p)).toHaveLength(0)
  })

  it('reads a monthly amount as recurring for affordability', () => {
    const f = extractSlots('affordability', ['amount'], '$5,000 per month')
    expect(f.recurringMonthly).toBe(5000)
    expect(f.amount).toBe(0)
    expect(missingParams('affordability', f)).toHaveLength(0)
  })
})
