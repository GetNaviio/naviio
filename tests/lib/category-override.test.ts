/**
 * Fix-the-AI category overrides — the property that makes the feature
 * trustworthy: an override MOVES an amount between categories without
 * changing any total, and an unrelated override changes nothing.
 */
import { incomeStatement } from '@/lib/metrics/compute'
import { USER_CATEGORIES } from '@/lib/metrics/classify'

const txn = (externalId: string, amount: number, category: string, desc: string) => ({
  source: 'plaid',
  type: 'DEBIT' as const,
  amount,
  category,
  description: desc,
  merchantName: null,
  date: new Date('2026-03-10T00:00:00Z'),
  externalId,
})

const LEDGER = [
  txn('t1', 100, 'GENERAL_SERVICES', 'AWS'),          // → Software & Services
  txn('t2', 50, 'GENERAL_SERVICES', 'Figma'),         // → Software & Services
  txn('t3', 200, 'RENT_AND_UTILITIES', 'WeWork'),     // → Rent & Utilities
]

const cat = (st: { expensesByCategory: { category: string; amount: number }[] }, name: string) =>
  st.expensesByCategory.find((c) => c.category === name)?.amount ?? 0

describe('incomeStatement with category overrides', () => {
  it('a per-transaction override moves just that row; totals unchanged', () => {
    const base = incomeStatement(LEDGER)
    const fixed = incomeStatement(LEDGER, undefined, undefined, { byVendor: {}, byTxn: { t1: 'Advertising & Marketing' } })
    expect(fixed.totalExpenses).toBe(base.totalExpenses)
    expect(cat(fixed, 'Advertising & Marketing')).toBe(100) // t1 (AWS)
    expect(cat(fixed, 'Software & Services')).toBe(50) // only t2 (Figma) remains
    expect(cat(fixed, 'Rent & Utilities')).toBe(200) // untouched
  })

  it('a vendor override moves every transaction of that vendor', () => {
    const L = [txn('a1', 100, 'GENERAL_SERVICES', 'AWS'), txn('a2', 40, 'GENERAL_SERVICES', 'AWS'), txn('t3', 200, 'RENT_AND_UTILITIES', 'WeWork')]
    const fixed = incomeStatement(L, undefined, undefined, { byVendor: { aws: 'Advertising & Marketing' }, byTxn: {} })
    expect(cat(fixed, 'Advertising & Marketing')).toBe(140) // both AWS rows
    expect(cat(fixed, 'Software & Services')).toBe(0)
  })

  it('a per-transaction override wins over the vendor default', () => {
    const L = [txn('a1', 100, 'GENERAL_SERVICES', 'AWS'), txn('a2', 40, 'GENERAL_SERVICES', 'AWS')]
    const fixed = incomeStatement(L, undefined, undefined, { byVendor: { aws: 'Advertising & Marketing' }, byTxn: { a2: 'Equipment' } })
    expect(cat(fixed, 'Advertising & Marketing')).toBe(100) // a1 follows vendor default
    expect(cat(fixed, 'Equipment')).toBe(40) // a2 pinned
  })

  it('an override for an id not in the ledger changes nothing', () => {
    const base = incomeStatement(LEDGER)
    const noop = incomeStatement(LEDGER, undefined, undefined, { byVendor: {}, byTxn: { ghost: 'Travel' } })
    expect(noop).toEqual(base)
  })

  it('category partition still sums to the total after overrides', () => {
    const fixed = incomeStatement(LEDGER, undefined, undefined, { byVendor: {}, byTxn: { t1: 'Equipment', t3: 'Insurance' } })
    const sum = fixed.expensesByCategory.reduce((s, c) => s + c.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(fixed.totalExpenses)
  })
})

describe('USER_CATEGORIES', () => {
  it('ends with Other and contains the auto-classifier labels', () => {
    expect(USER_CATEGORIES[USER_CATEGORIES.length - 1]).toBe('Other')
    expect(USER_CATEGORIES).toEqual(expect.arrayContaining(['Software & Services', 'Rent & Utilities', 'Travel']))
    expect(new Set(USER_CATEGORIES).size).toBe(USER_CATEGORIES.length) // no dupes
  })
})
