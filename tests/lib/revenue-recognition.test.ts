import { expandRevenueRecognition, deferredRevenueAsOf } from '@/lib/metrics/revenue-recognition'
import { incomeStatement, type DatedLedgerTxn } from '@/lib/metrics/compute'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

// A $1,200 annual subscription charged Jan 1 2026 covering Jan 2026 → Jan 2027.
const annual = (over: Partial<DatedLedgerTxn> = {}): DatedLedgerTxn => ({
  source: 'stripe',
  type: 'CREDIT',
  amount: 1200,
  category: 'REVENUE',
  description: 'Annual plan',
  merchantName: 'Acme',
  date: utc(2026, 1, 1),
  externalId: 'ch_annual',
  recognitionStart: utc(2026, 1, 1),
  recognitionEnd: utc(2027, 1, 1),
  ...over,
})

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0)

describe('expandRevenueRecognition (P0-3)', () => {
  it('spreads an annual charge into 12 monthly slices summing to the original', () => {
    const out = expandRevenueRecognition([annual()])
    expect(out).toHaveLength(12)
    expect(sum(out)).toBeCloseTo(1200, 2) // no rounding leakage
    expect(out.every((r) => r.category === 'REVENUE')).toBe(true)
    // each slice dated within the service year
    expect(out.every((r) => (r.date as Date).getUTCFullYear() === 2026)).toBe(true)
  })

  it('passes through one-time / monthly charges unchanged (no window or <1 month)', () => {
    const oneTime: DatedLedgerTxn = { ...annual({ externalId: 'ch_once' }), recognitionStart: null, recognitionEnd: null }
    const monthly: DatedLedgerTxn = annual({ externalId: 'ch_month', recognitionStart: utc(2026, 1, 1), recognitionEnd: utc(2026, 2, 1) })
    const out = expandRevenueRecognition([oneTime, monthly])
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.externalId)).toEqual(['ch_once', 'ch_month'])
  })

  it('leaves expenses (DEBIT) untouched even if a window is present', () => {
    const out = expandRevenueRecognition([annual({ type: 'DEBIT' })])
    expect(out).toHaveLength(1)
  })
})

describe('deferredRevenueAsOf (P0-3)', () => {
  it('is the full amount before the service starts', () => {
    expect(deferredRevenueAsOf([annual()], utc(2025, 12, 1))).toBeCloseTo(1200, 2)
  })
  it('is ~half-way through the year proportional to time remaining', () => {
    // Jul 1 → 184 of 365 days remain → 1200 * 184/365 ≈ 604.93
    expect(deferredRevenueAsOf([annual()], utc(2026, 7, 1))).toBeCloseTo(604.93, 1)
  })
  it('is zero once fully earned', () => {
    expect(deferredRevenueAsOf([annual()], utc(2027, 2, 1))).toBe(0)
  })
})

describe('incomeStatement recognizes ratably (P0-3)', () => {
  it('books ~1/12 in the billing month, not the full annual amount', () => {
    const jan = incomeStatement([annual()], utc(2026, 1, 1), utc(2026, 1, 31))
    expect(jan.totalIncome).toBeLessThan(150) // ~$102, NOT $1200
    expect(jan.totalIncome).toBeGreaterThan(80)
    expect(jan.deferredRevenue).toBeGreaterThan(1000) // most still deferred
  })
  it('books the full amount across the whole service year', () => {
    const year = incomeStatement([annual()], utc(2026, 1, 1), utc(2026, 12, 31))
    expect(year.totalIncome).toBeCloseTo(1200, 0)
  })
})
