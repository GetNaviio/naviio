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

describe('incomeStatement with category overrides', () => {
  it('moves the amount between categories; totals unchanged', () => {
    const base = incomeStatement(LEDGER)
    const fixed = incomeStatement(LEDGER, undefined, undefined, { t1: 'Advertising & Marketing' })

    expect(fixed.totalExpenses).toBe(base.totalExpenses)
    const cat = (st: typeof base, name: string) => st.expensesByCategory.find((c) => c.category === name)?.amount ?? 0
    expect(cat(fixed, 'Advertising & Marketing')).toBe(100)
    expect(cat(fixed, 'Software & Services')).toBe(50) // only t2 remains
    expect(cat(fixed, 'Rent & Utilities')).toBe(200) // untouched
  })

  it('an override for an id not in the ledger changes nothing', () => {
    const base = incomeStatement(LEDGER)
    const noop = incomeStatement(LEDGER, undefined, undefined, { ghost: 'Travel' })
    expect(noop).toEqual(base)
  })

  it('category partition still sums to the total after overrides', () => {
    const fixed = incomeStatement(LEDGER, undefined, undefined, { t1: 'Equipment', t3: 'Insurance' })
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
