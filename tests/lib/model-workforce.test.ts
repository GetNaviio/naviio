import {
  loadedMonthlyCost,
  roleActiveInMonth,
  workforceCostForMonth,
  headcountForMonth,
  workforceSeries,
  monthKeys,
  type PlannedRole,
} from '@/lib/model/workforce'

const role = (over: Partial<PlannedRole> = {}): PlannedRole => ({
  title: 'Engineer',
  headcount: 1,
  monthlySalary: 10000,
  loadedPct: 25,
  startMonth: '2026-07',
  endMonth: null,
  ...over,
})

describe('loadedMonthlyCost', () => {
  it('applies headcount and the loaded uplift', () => {
    expect(loadedMonthlyCost(role())).toBe(12500) // 10000 × 1.25
    expect(loadedMonthlyCost(role({ headcount: 3 }))).toBe(37500)
    expect(loadedMonthlyCost(role({ loadedPct: 0 }))).toBe(10000)
  })
})

describe('roleActiveInMonth', () => {
  it('starts at startMonth (inclusive) and runs forever without endMonth', () => {
    expect(roleActiveInMonth(role(), '2026-06')).toBe(false)
    expect(roleActiveInMonth(role(), '2026-07')).toBe(true)
    expect(roleActiveInMonth(role(), '2030-01')).toBe(true)
  })

  it('respects endMonth inclusively (planned offboarding)', () => {
    const r = role({ endMonth: '2026-09' })
    expect(roleActiveInMonth(r, '2026-09')).toBe(true)
    expect(roleActiveInMonth(r, '2026-10')).toBe(false)
  })

  it('handles year boundaries via lexical YYYY-MM ordering', () => {
    expect(roleActiveInMonth(role({ startMonth: '2026-12' }), '2027-01')).toBe(true)
    expect(roleActiveInMonth(role({ startMonth: '2027-01' }), '2026-12')).toBe(false)
  })
})

describe('workforceCostForMonth / headcountForMonth', () => {
  const roles = [
    role(), // 12,500/mo from Jul
    role({ title: 'AE', headcount: 2, monthlySalary: 6000, loadedPct: 30, startMonth: '2026-09' }), // 15,600 from Sep
  ]

  it('sums only active roles', () => {
    expect(workforceCostForMonth(roles, '2026-08')).toBe(12500)
    expect(workforceCostForMonth(roles, '2026-09')).toBe(12500 + 15600)
    expect(headcountForMonth(roles, '2026-09')).toBe(3)
  })

  it('is zero before anyone starts', () => {
    expect(workforceCostForMonth(roles, '2026-01')).toBe(0)
  })
})

describe('monthKeys', () => {
  it('crosses year boundaries correctly', () => {
    expect(monthKeys('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('workforceSeries', () => {
  it('produces a point per requested month', () => {
    const s = workforceSeries([role()], monthKeys('2026-06', 3))
    expect(s).toEqual([
      { month: '2026-06', cost: 0, headcount: 0 },
      { month: '2026-07', cost: 12500, headcount: 1 },
      { month: '2026-08', cost: 12500, headcount: 1 },
    ])
  })
})
