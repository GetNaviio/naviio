import { classify, classifyWithOverride, isStripePayout, expenseLabel, resolveVendorCategories, EXCLUDE_CATEGORY, type LedgerTxn, type CommunityPrior } from '@/lib/metrics/classify'
import { incomeStatement, cashFlow, runwayMonths, type DatedLedgerTxn } from '@/lib/metrics/compute'

const t = (o: Partial<DatedLedgerTxn>): DatedLedgerTxn => ({
  source: 'plaid', type: 'DEBIT', amount: 0, date: '2026-03-15', ...o,
})

describe('classify', () => {
  it('treats Stripe charges as revenue', () => {
    expect(classify({ source: 'stripe', type: 'CREDIT', amount: 100, category: 'REVENUE' }).bucket).toBe('REVENUE')
  })

  it('excludes a Stripe payout arriving in the bank (no double-count)', () => {
    const payout: LedgerTxn = { source: 'plaid', type: 'CREDIT', amount: 5000, category: 'TRANSFER_IN', description: 'STRIPE TRANSFER' }
    expect(isStripePayout(payout)).toBe(true)
    const c = classify(payout)
    expect(c.bucket).toBe('TRANSFER')
    expect(c.transferKind).toBe('STRIPE_PAYOUT')
    expect(c.excludedFromPnl).toBe(true)
  })

  it('excludes internal transfers from P&L', () => {
    expect(classify({ source: 'plaid', type: 'DEBIT', amount: 1000, category: 'TRANSFER_OUT', description: 'Move to savings' }).transferKind).toBe('INTERNAL')
  })

  it('treats loan payments as capital, not expense', () => {
    expect(classify({ source: 'plaid', type: 'DEBIT', amount: 800, category: 'LOAN_PAYMENTS' }).transferKind).toBe('CAPITAL')
  })

  it('treats non-Stripe bank credits as income', () => {
    expect(classify({ source: 'plaid', type: 'CREDIT', amount: 1200, category: 'INCOME', description: 'Client wire' }).bucket).toBe('REVENUE')
  })

  it('treats ordinary bank debits as categorized expenses', () => {
    const c = classify({ source: 'plaid', type: 'DEBIT', amount: 300, category: 'RENT_AND_UTILITIES' })
    expect(c.bucket).toBe('EXPENSE')
    expect(c.expenseCategory).toBe('Rent & Utilities')
  })

  it('classifies a Gusto payroll debit as Payroll even when Plaid tags it a transfer', () => {
    // Real-world quirk: Plaid files this ACH as TRANSFER_OUT with a jammed
    // descriptor. Payroll is a P&L expense, not an internal transfer.
    const c = classify({ source: 'plaid', type: 'DEBIT', amount: 6000, category: 'TRANSFER_OUT', description: 'ACH Electronic CreditGUSTO PAY 123456' })
    expect(c.bucket).toBe('EXPENSE')
    expect(c.expenseCategory).toBe('Payroll & Contractors')
    expect(c.excludedFromPnl).toBe(false)
  })

  it('does not catch a payroll-provider refund coming back in (credit stays revenue path)', () => {
    const c = classify({ source: 'plaid', type: 'CREDIT', amount: 200, category: 'TRANSFER_IN', description: 'GUSTO refund' })
    expect(c.bucket).toBe('TRANSFER') // CREDIT → not promoted to payroll expense
  })

  it('maps unknown categories to Other', () => {
    expect(expenseLabel('SOMETHING_NEW')).toBe('Other')
    expect(expenseLabel(null)).toBe('Other')
  })

  it('scores confidence + flags an uncategorized expense for review', () => {
    const known = classify({ source: 'plaid', type: 'DEBIT', amount: 6000, category: 'TRANSFER_OUT', description: 'GUSTO PAY' })
    expect(known.confidence).toBeGreaterThan(0.8)
    expect(known.source).toBe('merchant')
    expect(known.needsReview).toBeFalsy()

    const unknown = classify({ source: 'plaid', type: 'DEBIT', amount: 410, category: null, description: 'SQ *ACME WIDGETS LLC' })
    expect(unknown.expenseCategory).toBe('Other')
    expect(unknown.confidence).toBeLessThan(0.5)
    expect(unknown.needsReview).toBe(true)
    expect(unknown.source).toBe('fallback')
  })
})

describe('classifyWithOverride (cross-bucket)', () => {
  const transfer: LedgerTxn = { source: 'plaid', type: 'DEBIT', amount: 500, category: 'TRANSFER_OUT', description: 'Move to savings' }
  const expense: LedgerTxn = { source: 'plaid', type: 'DEBIT', amount: 300, category: 'RENT_AND_UTILITIES' }
  const credit: LedgerTxn = { source: 'plaid', type: 'CREDIT', amount: 1000, category: 'INCOME', description: 'client wire' }

  it('leaves auto classification alone with no override', () => {
    expect(classifyWithOverride(transfer, null)).toEqual({ bucket: 'TRANSFER', inCashFlow: false })
  })
  it('forces a DEBIT transfer to an expense when the user reclassifies it', () => {
    expect(classifyWithOverride(transfer, 'Software & Services')).toEqual({ bucket: 'EXPENSE', inCashFlow: true })
  })
  it('excludes a row from the P&L (and cash flow) when marked EXCLUDE', () => {
    expect(classifyWithOverride(expense, EXCLUDE_CATEGORY)).toEqual({ bucket: 'TRANSFER', inCashFlow: false })
  })
  it('never forces a CREDIT (money-in) into an expense', () => {
    expect(classifyWithOverride(credit, 'Software & Services').bucket).toBe('REVENUE')
  })
})

describe('incomeStatement honors cross-bucket overrides', () => {
  const rows: DatedLedgerTxn[] = [
    t({ externalId: 'tx-rent', amount: 300, category: 'RENT_AND_UTILITIES', date: '2026-03-01' }),
    t({ externalId: 'tx-mislabeled', amount: 500, category: 'TRANSFER_OUT', description: 'ACME LLC', date: '2026-03-02' }),
  ]
  it('counts a transfer the user reclassified as an expense', () => {
    const base = incomeStatement(rows, undefined, undefined)
    expect(base.totalExpenses).toBe(300) // the TRANSFER_OUT row is excluded by default
    const fixed = incomeStatement(rows, undefined, undefined, { byVendor: {}, byTxn: { 'tx-mislabeled': 'Software & Services' } })
    expect(fixed.totalExpenses).toBe(800) // now included
  })
  it('drops an expense the user excluded from the P&L', () => {
    const excluded = incomeStatement(rows, undefined, undefined, { byVendor: {}, byTxn: { 'tx-rent': EXCLUDE_CATEGORY } })
    expect(excluded.totalExpenses).toBe(0)
  })
})

describe('community prior', () => {
  const t = (description: string): LedgerTxn => ({ source: 'plaid', type: 'DEBIT', amount: 100, category: null, description })

  it('fills a vendor the heuristics can not name from the community prior', () => {
    const txns = [t('ACME WIDGETS'), t('ACME WIDGETS')]
    // Without a prior → Other.
    expect(resolveVendorCategories(txns).get('acme widgets')).toBe('Other')
    // With a community prior → the agreed category.
    const prior: CommunityPrior = new Map([['acme widgets', { category: 'Software & Services', confidence: 0.9 }]])
    expect(resolveVendorCategories(txns, {}, prior).get('acme widgets')).toBe('Software & Services')
  })

  it('never lets the community prior override a local user fix', () => {
    const txns = [t('ACME WIDGETS')]
    const prior: CommunityPrior = new Map([['acme widgets', { category: 'Software & Services', confidence: 0.9 }]])
    expect(resolveVendorCategories(txns, { 'acme widgets': 'Equipment' }, prior).get('acme widgets')).toBe('Equipment')
  })
})

describe('incomeStatement', () => {
  const ledger: DatedLedgerTxn[] = [
    t({ source: 'stripe', type: 'CREDIT', amount: 10000, category: 'REVENUE', date: '2026-01-10' }),
    t({ source: 'stripe', type: 'CREDIT', amount: 12000, category: 'REVENUE', date: '2026-02-10' }),
    // Stripe payout landing in bank — MUST NOT be counted again
    t({ source: 'plaid', type: 'CREDIT', amount: 9500, category: 'TRANSFER_IN', description: 'STRIPE PAYOUT', date: '2026-02-12' }),
    // Real operating expenses
    t({ source: 'plaid', type: 'DEBIT', amount: 4000, category: 'RENT_AND_UTILITIES', date: '2026-01-05' }),
    t({ source: 'plaid', type: 'DEBIT', amount: 1500, category: 'GENERAL_SERVICES', date: '2026-02-05' }),
    // Internal transfer + loan principal — excluded from P&L
    t({ source: 'plaid', type: 'DEBIT', amount: 3000, category: 'TRANSFER_OUT', date: '2026-01-20' }),
    t({ source: 'plaid', type: 'DEBIT', amount: 800, category: 'LOAN_PAYMENTS', date: '2026-02-20' }),
  ]

  it('counts Stripe revenue once and excludes the payout', () => {
    const r = incomeStatement(ledger)
    expect(r.totalIncome).toBe(22000)            // 10k + 12k, NOT + 9.5k payout
    expect(r.totalExpenses).toBe(5500)           // 4000 + 1500 only
    expect(r.netIncome).toBe(16500)
  })

  it('computes net margin', () => {
    expect(incomeStatement(ledger).netMargin).toBeCloseTo(75, 1)
  })

  it('buckets expenses by category, sorted', () => {
    const cats = incomeStatement(ledger).expensesByCategory
    expect(cats[0]).toEqual({ category: 'Rent & Utilities', amount: 4000 })
    expect(cats.find((c) => c.category === 'Software & Services')?.amount).toBe(1500)
  })

  it('produces a monthly series', () => {
    const m = incomeStatement(ledger).byMonth
    expect(m).toEqual([
      { month: '2026-01', income: 10000, expenses: 4000, net: 6000 },
      { month: '2026-02', income: 12000, expenses: 1500, net: 10500 },
    ])
  })

  it('respects the date window', () => {
    const jan = incomeStatement(ledger, new Date('2026-01-01'), new Date('2026-01-31T23:59:59Z'))
    expect(jan.totalIncome).toBe(10000)
    expect(jan.totalExpenses).toBe(4000)
  })
})

describe('cashFlow', () => {
  const ledger: DatedLedgerTxn[] = [
    // Stripe payout = real cash IN
    t({ source: 'plaid', type: 'CREDIT', amount: 9500, category: 'TRANSFER_IN', description: 'STRIPE PAYOUT', date: '2026-02-12' }),
    // Operating expense = cash OUT
    t({ source: 'plaid', type: 'DEBIT', amount: 4000, category: 'RENT_AND_UTILITIES', date: '2026-02-05' }),
    // Loan principal = cash OUT (capital, but still leaves the bank)
    t({ source: 'plaid', type: 'DEBIT', amount: 800, category: 'LOAN_PAYMENTS', date: '2026-02-20' }),
    // Internal transfer = NOT cash flow
    t({ source: 'plaid', type: 'DEBIT', amount: 3000, category: 'TRANSFER_OUT', date: '2026-02-21' }),
    // Stripe charge is NOT bank cash until it pays out — ignored here
    t({ source: 'stripe', type: 'CREDIT', amount: 12000, category: 'REVENUE', date: '2026-02-10' }),
  ]

  it('counts payouts in, expenses+principal out, ignores internal moves and Stripe charges', () => {
    const r = cashFlow(ledger)
    expect(r.cashIn).toBe(9500)
    expect(r.cashOut).toBe(4800)        // 4000 + 800, NOT the 3000 internal transfer
    expect(r.netCashFlow).toBe(4700)
  })

  it('derives a burn rate only from net-negative months', () => {
    const burn: DatedLedgerTxn[] = [
      t({ source: 'plaid', type: 'DEBIT', amount: 10000, category: 'GENERAL_SERVICES', date: '2026-01-10' }),
      t({ source: 'plaid', type: 'CREDIT', amount: 2000, category: 'INCOME', date: '2026-01-11' }),
    ]
    expect(cashFlow(burn).burnRate).toBe(8000)   // net -8000 in one month
  })
})

describe('runwayMonths', () => {
  it('divides cash by burn', () => {
    expect(runwayMonths(80000, 8000)).toBe(10)
  })
  it('is Infinity when not burning', () => {
    expect(runwayMonths(80000, 0)).toBe(Infinity)
  })
})
