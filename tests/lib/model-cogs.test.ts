import { classifyExpense } from '@/lib/model/cogs'
import { modelIncomeStatement, type ModelTxn } from '@/lib/model/incomeStatement'

const expense = (over: Partial<ModelTxn>): ModelTxn => ({
  source: 'plaid',
  type: 'DEBIT',
  amount: 100,
  ...over,
})
const revenue = (amount: number, over: Partial<ModelTxn> = {}): ModelTxn => ({
  source: 'stripe',
  type: 'CREDIT',
  amount,
  category: 'REVENUE',
  ...over,
})

describe('classifyExpense', () => {
  it('flags cloud hosting as COGS via keyword', () => {
    expect(classifyExpense(expense({ description: 'AWS bill', merchantName: 'Amazon Web Services' })).expenseClass).toBe('COGS')
  })

  it('flags payment processing as COGS', () => {
    expect(classifyExpense(expense({ description: 'Monthly processing fee' })).expenseClass).toBe('COGS')
  })

  it('defaults other spend to OPEX', () => {
    expect(classifyExpense(expense({ description: 'WeWork rent', category: 'RENT_AND_UTILITIES' })).expenseClass).toBe('OPEX')
  })

  it('lets a user override beat the heuristic', () => {
    // Hosting would heuristically be COGS, but the user tagged it OPEX.
    expect(classifyExpense(expense({ description: 'AWS' }), 'OPEX').expenseClass).toBe('OPEX')
  })

  it('returns null expenseClass for revenue rows', () => {
    expect(classifyExpense(revenue(500)).expenseClass).toBeNull()
  })

  it('excludes Stripe payouts (transfer) from expense classes', () => {
    const payout = { source: 'plaid', type: 'CREDIT' as const, amount: 1000, description: 'STRIPE TRANSFER' }
    expect(classifyExpense(payout).expenseClass).toBeNull()
  })
})

describe('modelIncomeStatement', () => {
  it('computes gross profit and margin', () => {
    const txns: ModelTxn[] = [
      revenue(1000),
      expense({ amount: 200, description: 'AWS hosting' }),  // COGS
      expense({ amount: 300, description: 'Salaries', category: 'GENERAL_SERVICES' }), // OPEX
    ]
    const s = modelIncomeStatement(txns)
    expect(s.revenue).toBe(1000)
    expect(s.cogs).toBe(200)
    expect(s.grossProfit).toBe(800)
    expect(s.grossMargin).toBeCloseTo(0.8)
    expect(s.opex).toBe(300)
    expect(s.operatingIncome).toBe(500)
    expect(s.operatingMargin).toBeCloseTo(0.5)
  })

  it('applies user overrides by externalId', () => {
    const txns: ModelTxn[] = [
      revenue(1000),
      expense({ amount: 200, description: 'AWS hosting', externalId: 'tx1' }), // heuristic COGS
    ]
    // Override tx1 to OPEX → COGS becomes 0, opex 200.
    const s = modelIncomeStatement(txns, { tx1: 'OPEX' })
    expect(s.cogs).toBe(0)
    expect(s.opex).toBe(200)
    expect(s.grossProfit).toBe(1000)
  })

  it('null margins when there is no revenue', () => {
    const s = modelIncomeStatement([expense({ amount: 50, description: 'AWS' })])
    expect(s.revenue).toBe(0)
    expect(s.grossMargin).toBeNull()
    expect(s.operatingMargin).toBeNull()
  })

  it('OTHER override drops a row from gross-margin math', () => {
    const txns: ModelTxn[] = [
      revenue(1000),
      expense({ amount: 100, description: 'AWS', externalId: 'tx1' }),
    ]
    const s = modelIncomeStatement(txns, { tx1: 'OTHER' })
    expect(s.cogs).toBe(0)
    expect(s.opex).toBe(0)
    expect(s.operatingIncome).toBe(1000)
  })
})
