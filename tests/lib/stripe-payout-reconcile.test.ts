import { reconcileStripePayouts, STRIPE_PAYOUT_CATEGORY, type PayoutRef } from '@/lib/metrics/stripe-payout-reconcile'
import { isStripePayout } from '@/lib/metrics/classify'

type Row = { source: string; type: 'CREDIT' | 'DEBIT'; amount: number; date: Date; category: string | null; merchantName?: string | null; description?: string | null; externalId?: string }
const credit = (amount: number, date: Date, over: Partial<Row> = {}): Row =>
  ({ source: 'plaid', type: 'CREDIT', amount, date, category: null, description: 'ACH DEPOSIT', merchantName: null, externalId: 'x', ...over })

const day = (d: number) => new Date(Date.UTC(2026, 5, d))

describe('reconcileStripePayouts (P0-4)', () => {
  it('tags a bank deposit matching a payout by amount + arrival date', () => {
    const rows = [credit(1000, day(10))]
    const payouts: PayoutRef[] = [{ amountCents: 100000, arrivalDate: day(11) }] // +1 day, within window
    const out = reconcileStripePayouts(rows, payouts)
    expect(out[0].category).toBe(STRIPE_PAYOUT_CATEGORY)
    expect(isStripePayout(out[0] as Parameters<typeof isStripePayout>[0])).toBe(true)
  })

  it('does NOT tag a deposit outside the date window', () => {
    const out = reconcileStripePayouts([credit(1000, day(1))], [{ amountCents: 100000, arrivalDate: day(20) }])
    expect(out[0].category).toBeNull()
  })

  it('does NOT tag a deposit with a different amount (no double-exclusion)', () => {
    const out = reconcileStripePayouts([credit(999.5, day(10))], [{ amountCents: 100000, arrivalDate: day(10) }])
    expect(out[0].category).toBeNull()
  })

  it('consumes each payout once — two equal deposits, one payout → only one tagged', () => {
    const rows = [credit(1000, day(10)), credit(1000, day(10))]
    const out = reconcileStripePayouts(rows, [{ amountCents: 100000, arrivalDate: day(10) }])
    const tagged = out.filter((r) => r.category === STRIPE_PAYOUT_CATEGORY)
    expect(tagged).toHaveLength(1)
  })

  it('ignores debits and non-plaid rows', () => {
    const rows: Row[] = [
      { source: 'plaid', type: 'DEBIT', amount: 1000, date: day(10), category: null },
      { source: 'stripe', type: 'CREDIT', amount: 1000, date: day(10), category: null },
    ]
    const out = reconcileStripePayouts(rows, [{ amountCents: 100000, arrivalDate: day(10) }])
    expect(out.every((r) => r.category === null)).toBe(true)
  })

  it('no-ops when there are no payouts (falls back to description heuristic elsewhere)', () => {
    const rows = [credit(1000, day(10), { description: 'STRIPE TRANSFER' })]
    const out = reconcileStripePayouts(rows, [])
    expect(out[0].category).toBeNull()
    // the weak description fallback still catches an obvious "stripe" deposit
    expect(isStripePayout(out[0] as Parameters<typeof isStripePayout>[0])).toBe(true)
  })
})
