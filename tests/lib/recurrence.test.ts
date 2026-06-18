import { detectRecurring, recurringVendorKeys } from '@/lib/metrics/recurrence'
import type { LedgerTxn } from '@/lib/metrics/classify'

type DatedTxn = LedgerTxn & { date: string }
const debit = (description: string, amount: number, date: string): DatedTxn => ({
  source: 'plaid', type: 'DEBIT', amount, category: null, description, date,
})

describe('detectRecurring', () => {
  it('detects a monthly, stable-amount stream', () => {
    const txns = [
      debit('ACME RENT', 5000, '2026-01-01'),
      debit('ACME RENT', 5000, '2026-02-01'),
      debit('ACME RENT', 5050, '2026-03-01'),
      debit('ACME RENT', 5000, '2026-04-01'),
    ]
    const streams = detectRecurring(txns)
    const s = streams.get('acme rent')
    expect(s?.cadence).toBe('monthly')
    expect(s?.recurring).toBe(true)
    expect(recurringVendorKeys(streams).has('acme rent')).toBe(true)
  })

  it('detects a biweekly payroll stream', () => {
    const txns = [
      debit('GUSTO PAY', 12000, '2026-01-02'),
      debit('GUSTO PAY', 12000, '2026-01-16'),
      debit('GUSTO PAY', 12000, '2026-01-30'),
      debit('GUSTO PAY', 12000, '2026-02-13'),
    ]
    expect(detectRecurring(txns).get('gusto pay')?.cadence).toBe('biweekly')
  })

  it('does not flag a one-off or wildly variable charge', () => {
    const oneOff = [debit('UNITED AIRLINES', 500, '2026-01-10')]
    expect(detectRecurring(oneOff).get('united airlines')).toBeUndefined() // < 3 occurrences

    const variable = [
      debit('AMAZON', 20, '2026-01-03'),
      debit('AMAZON', 400, '2026-01-19'),
      debit('AMAZON', 35, '2026-02-22'),
    ]
    expect(detectRecurring(variable).get('amazon')?.recurring).toBe(false) // amounts not stable
  })

  it('ignores credits (money in)', () => {
    const credits: DatedTxn[] = [
      { source: 'plaid', type: 'CREDIT', amount: 9000, category: null, description: 'STRIPE PAYOUT', date: '2026-01-01' },
      { source: 'plaid', type: 'CREDIT', amount: 9000, category: null, description: 'STRIPE PAYOUT', date: '2026-02-01' },
      { source: 'plaid', type: 'CREDIT', amount: 9000, category: null, description: 'STRIPE PAYOUT', date: '2026-03-01' },
    ]
    expect(detectRecurring(credits).size).toBe(0)
  })
})
