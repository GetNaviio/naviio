import { mapPlaidTransaction } from '@/lib/integrations/plaid-map'
import type { Transaction as PlaidTransaction } from 'plaid'

// Minimal Plaid transaction factory — only the fields the mapper reads.
function plaidTx(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    transaction_id: 'txn_1',
    account_id: 'acc_1',
    name: 'Coffee Shop',
    amount: 4.5,
    date: '2026-05-01',
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    merchant_name: 'Blue Bottle',
    category: ['Food and Drink', 'Coffee'],
    personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
    pending: false,
    ...overrides,
  } as unknown as PlaidTransaction
}

describe('mapPlaidTransaction', () => {
  const ORG = 'org_1'
  const INT = 'int_1'

  it('maps core fields and uses externalId = transaction_id', () => {
    const row = mapPlaidTransaction(ORG, INT, plaidTx())
    expect(row.orgId).toBe(ORG)
    expect(row.integrationId).toBe(INT)
    expect(row.externalId).toBe('txn_1')
    expect(row.accountId).toBe('acc_1')
    expect(row.description).toBe('Coffee Shop')
    expect(row.merchantName).toBe('Blue Bottle')
    expect(row.source).toBe('plaid')
    expect(row.date).toEqual(new Date('2026-05-01'))
  })

  it('treats a positive Plaid amount as a DEBIT (outflow) and stores the magnitude', () => {
    const row = mapPlaidTransaction(ORG, INT, plaidTx({ amount: 4.5 }))
    expect(row.type).toBe('DEBIT')
    expect(row.amount).toBe(4.5)
  })

  it('treats a negative Plaid amount as a CREDIT (inflow) and stores the magnitude', () => {
    const row = mapPlaidTransaction(ORG, INT, plaidTx({ amount: -1200 }))
    expect(row.type).toBe('CREDIT')
    expect(row.amount).toBe(1200)
  })

  it('prefers the personal_finance_category primary over the legacy category', () => {
    const row = mapPlaidTransaction(ORG, INT, plaidTx())
    expect(row.category).toBe('FOOD_AND_DRINK')
  })

  it('falls back to the legacy category when PFC is absent', () => {
    const row = mapPlaidTransaction(
      ORG,
      INT,
      plaidTx({ personal_finance_category: null, category: ['Travel', 'Airlines'] }),
    )
    expect(row.category).toBe('Travel')
  })

  it('defaults currency to USD when none is provided', () => {
    const row = mapPlaidTransaction(
      ORG,
      INT,
      plaidTx({ iso_currency_code: null, unofficial_currency_code: null }),
    )
    expect(row.currency).toBe('USD')
  })

  it('uses unofficial_currency_code when iso is missing', () => {
    const row = mapPlaidTransaction(
      ORG,
      INT,
      plaidTx({ iso_currency_code: null, unofficial_currency_code: 'CAD' }),
    )
    expect(row.currency).toBe('CAD')
  })

  it('handles a missing merchant name', () => {
    const row = mapPlaidTransaction(ORG, INT, plaidTx({ merchant_name: null }))
    expect(row.merchantName).toBeNull()
  })
})
