import { cashFlow } from '@/lib/metrics/compute'
import { classify } from '@/lib/metrics/classify'

type Txn = Parameters<typeof cashFlow>[0][number]
const tx = (over: Partial<Txn>): Txn =>
  ({ source: 'plaid', type: 'DEBIT', amount: 0, category: null, description: '', merchantName: null, date: new Date(), externalId: 'x', ...over } as Txn)

const month = (y: number, m: number, d = 15) => new Date(Date.UTC(y, m - 1, d))

describe('cashFlow burn rate (P0-1/P0-2)', () => {
  it('averages net over the trailing complete months, INCLUDING break-even/positive months', () => {
    // Jan: -30k (out 30k), Feb: 0 (out 10k/in 10k), Mar: -30k, Apr (current/partial): -5k
    const txns: Txn[] = [
      tx({ type: 'DEBIT', amount: 30000, date: month(2026, 1) }),
      tx({ type: 'DEBIT', amount: 10000, date: month(2026, 2) }),
      tx({ type: 'CREDIT', amount: 10000, date: month(2026, 2) }),
      tx({ type: 'DEBIT', amount: 30000, date: month(2026, 3) }),
      tx({ type: 'DEBIT', amount: 5000, date: month(2026, 4) }), // partial current month — excluded
    ]
    const cf = cashFlow(txns)
    // Complete months (Jan,Feb,Mar): nets -30k, 0, -30k → avg -20k → burn 20k.
    // The old (buggy) code averaged only Jan & Mar → 30k. New code = 20k.
    expect(cf.burnRate).toBeCloseTo(20000, 0)
  })

  it('reports 0 burn when the trailing window is net cash-positive', () => {
    const txns: Txn[] = [
      tx({ type: 'CREDIT', amount: 50000, date: month(2026, 1) }),
      tx({ type: 'DEBIT', amount: 10000, date: month(2026, 1) }),
      tx({ type: 'CREDIT', amount: 40000, date: month(2026, 2) }),
      tx({ type: 'DEBIT', amount: 10000, date: month(2026, 2) }),
    ]
    expect(cashFlow(txns).burnRate).toBe(0)
  })
})

describe('classify equity movements (P1-2)', () => {
  const eq = (description: string, type: 'CREDIT' | 'DEBIT') =>
    classify({ source: 'plaid', type, amount: 5000, category: null, description, merchantName: null, date: new Date(), externalId: 'x' } as Parameters<typeof classify>[0])

  it('excludes an owner draw (DEBIT) from the P&L as a capital/equity transfer', () => {
    const c = eq('OWNER DRAW', 'DEBIT')
    expect(c.bucket).toBe('TRANSFER')
    expect(c.excludedFromPnl).toBe(true)
  })

  it('excludes a capital contribution (CREDIT) — not revenue', () => {
    const c = eq('Capital contribution', 'CREDIT')
    expect(c.bucket).toBe('TRANSFER')
    expect(c.excludedFromPnl).toBe(true)
  })

  it('excludes a shareholder distribution', () => {
    expect(eq('Distribution to owner', 'DEBIT').bucket).toBe('TRANSFER')
    expect(eq('Shareholder distribution', 'DEBIT').bucket).toBe('TRANSFER')
  })
})
