import {
  parseXeroDate, mapXeroBankTransaction,
  mapQBOPurchase, mapQBODeposit, mapQBOSalesReceipt,
} from '@/lib/integrations/accounting-txn-map'

describe('parseXeroDate', () => {
  it('parses the /Date(ms)/ format', () => {
    expect(parseXeroDate('/Date(1609459200000+0000)/').getTime()).toBe(1609459200000)
  })
  it('parses ISO', () => {
    expect(parseXeroDate('2026-03-15').getUTCFullYear()).toBe(2026)
  })
})

describe('mapXeroBankTransaction', () => {
  it('maps RECEIVE → CREDIT', () => {
    const r = mapXeroBankTransaction('o', 'i', { BankTransactionID: 'b1', Type: 'RECEIVE', Total: 1200, Date: '2026-02-01', Contact: { Name: 'Acme' } })!
    expect(r.type).toBe('CREDIT')
    expect(r.amount).toBe(1200)
    expect(r.externalId).toBe('xero_b1')
    expect(r.source).toBe('xero')
  })
  it('maps SPEND → DEBIT with account category', () => {
    const r = mapXeroBankTransaction('o', 'i', { BankTransactionID: 'b2', Type: 'SPEND', Total: 300, Date: '2026-02-02', LineItems: [{ AccountCode: '400' }] })!
    expect(r.type).toBe('DEBIT')
    expect(r.category).toBe('XERO_400')
  })
  it('skips unknown / transfer types', () => {
    expect(mapXeroBankTransaction('o', 'i', { BankTransactionID: 'b3', Type: 'TRANSFER', Total: 5 })).toBeNull()
    expect(mapXeroBankTransaction('o', 'i', { Type: 'RECEIVE', Total: 5 })).toBeNull()
  })
})

describe('QuickBooks mappers', () => {
  it('Purchase → DEBIT', () => {
    const r = mapQBOPurchase('o', 'i', { Id: '7', TotalAmt: 500, TxnDate: '2026-01-10', EntityRef: { name: 'AWS' } })!
    expect(r.type).toBe('DEBIT')
    expect(r.amount).toBe(500)
    expect(r.externalId).toBe('qbo_purchase_7')
    expect(r.source).toBe('quickbooks')
  })
  it('Deposit + SalesReceipt → CREDIT', () => {
    expect(mapQBODeposit('o', 'i', { Id: '8', TotalAmt: 9000, TxnDate: '2026-01-11' })!.type).toBe('CREDIT')
    expect(mapQBOSalesReceipt('o', 'i', { Id: '9', TotalAmt: 250, TxnDate: '2026-01-12' })!.type).toBe('CREDIT')
  })
  it('returns null without an Id', () => {
    expect(mapQBOPurchase('o', 'i', { TotalAmt: 1 })).toBeNull()
  })
})
