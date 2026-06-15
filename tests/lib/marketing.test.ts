import { isMarketingSpend, marketingSpend, cac, magicNumber } from '@/lib/metrics/marketing'
import type { DatedLedgerTxn } from '@/lib/metrics/compute'

const tx = (o: Partial<DatedLedgerTxn>): DatedLedgerTxn => ({ source: 'plaid', type: 'DEBIT', amount: 0, date: '2026-03-15', category: 'GENERAL_SERVICES', ...o })

describe('isMarketingSpend', () => {
  it('detects major ad platforms', () => {
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'Google Ads' })).toBe(true)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, description: 'META PLATFORMS' })).toBe(true)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'LinkedIn Ads' })).toBe(true)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, description: 'Advertising campaign' })).toBe(true)
  })
  it('ignores ordinary spend + ambiguous non-ad products', () => {
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'AWS' })).toBe(false)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'Whole Foods' })).toBe(false)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'Metal Supply Co' })).toBe(false)
    expect(isMarketingSpend({ source: 'plaid', type: 'DEBIT', amount: 1, merchantName: 'LinkedIn Premium' })).toBe(false)
  })
})

describe('marketingSpend', () => {
  const ledger: DatedLedgerTxn[] = [
    tx({ amount: 5000, merchantName: 'Google Ads', date: '2026-03-02' }),
    tx({ amount: 3000, merchantName: 'Meta Ads', date: '2026-03-10' }),
    tx({ amount: 1200, merchantName: 'AWS', date: '2026-03-05' }),          // not marketing
    tx({ amount: 9000, type: 'CREDIT', merchantName: 'Google Ads refund', category: 'INCOME', date: '2026-03-06' }), // credit, not expense
    tx({ amount: 800, merchantName: 'LinkedIn', date: '2026-02-15' }),       // out of window
  ]
  it('sums only marketing expenses in window', () => {
    expect(marketingSpend(ledger, new Date('2026-03-01'), new Date('2026-03-31T23:59:59Z'))).toBe(8000)
  })
})

describe('cac & magicNumber', () => {
  it('CAC = spend / new customers', () => {
    expect(cac(8000, 16)).toBe(500)
    expect(cac(8000, 0)).toBeNull()
  })
  it('Magic Number = net-new ARR / marketing', () => {
    expect(magicNumber(12000, 8000)).toBe(1.5)
    expect(magicNumber(12000, 0)).toBeNull()
  })
})
