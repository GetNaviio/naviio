import { cashFlow, incomeStatement, type DatedLedgerTxn } from '@/lib/metrics/compute'
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

describe('incomeStatement gross profit (cross-industry COGS)', () => {
  const row = (o: Partial<DatedLedgerTxn>): DatedLedgerTxn =>
    ({ source: 'plaid', type: 'DEBIT', amount: 0, category: null, description: '', merchantName: null, date: month(2026, 3), externalId: 'x', ...o } as DatedLedgerTxn)

  it('splits COGS out of expenses and reports gross profit / margin', () => {
    const txns: DatedLedgerTxn[] = [
      row({ type: 'CREDIT', amount: 1000, description: 'Sale', externalId: 'r1' }),
      row({ type: 'DEBIT', amount: 300, description: 'AWS cloud hosting', merchantName: 'AWS', externalId: 'c1' }), // COGS heuristic
      row({ type: 'DEBIT', amount: 200, description: 'Office rent', externalId: 'o1' }),                            // OpEx
    ]
    const is = incomeStatement(txns)
    expect(is.totalIncome).toBe(1000)
    expect(is.totalExpenses).toBe(500)
    expect(is.cogs).toBe(300)
    expect(is.grossProfit).toBe(700)
    expect(is.grossMargin).toBe(70) // 700/1000
    expect(is.operatingExpenses).toBe(200)
    expect(is.operatingIncome).toBe(500) // == netIncome on cash basis
    expect(is.netIncome).toBe(500)
  })

  it('honors a user COGS/OpEx tag over the heuristic', () => {
    const txns: DatedLedgerTxn[] = [
      row({ type: 'CREDIT', amount: 1000, externalId: 'r1' }),
      row({ type: 'DEBIT', amount: 400, description: 'Food supplier', merchantName: 'Sysco', externalId: 'c1' }), // COGS via 'sysco'
    ]
    // Override c1 to OPEX → cogs should drop to 0
    const is = incomeStatement(txns, undefined, undefined, undefined, undefined, { c1: 'OPEX' })
    expect(is.cogs).toBe(0)
    expect(is.grossProfit).toBe(1000)
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
