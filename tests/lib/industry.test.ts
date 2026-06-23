import { inferIndustry, isRecurringRevenue, industryLabel } from '@/lib/metrics/industry'
import type { LedgerTxn } from '@/lib/metrics/classify'

const tx = (description: string, merchantName: string | null = null): LedgerTxn =>
  ({ source: 'plaid', type: 'DEBIT', amount: 100, category: null, description, merchantName } as LedgerTxn)

describe('inferIndustry (P2 detection)', () => {
  it('infers restaurant from food-supplier signals', () => {
    const r = inferIndustry([tx('SYSCO FOODS'), tx('US FOODS'), tx('Toast POS'), tx('Produce supplier')])
    expect(r.industry).toBe('restaurant')
    expect(r.confidence).toBeGreaterThan(0)
  })

  it('infers trades from materials + subcontractors', () => {
    const r = inferIndustry([tx('HOME DEPOT'), tx('Lumber yard'), tx('Subcontractor payment'), tx('Ferguson plumbing')])
    expect(r.industry).toBe('trades')
  })

  it('infers professional services from law / accounting / consulting signals', () => {
    const r = inferIndustry([tx('Law firm LLP'), tx('CPA accounting firm'), tx('Clio'), tx('consulting engagement letter')])
    expect(r.industry).toBe('proservices')
  })

  it('infers nonprofit from grant / donor signals', () => {
    const r = inferIndustry([tx('Grant disbursement'), tx('Donor pledge'), tx('Blackbaud'), tx('Foundation gift')])
    expect(r.industry).toBe('nonprofit')
  })

  it('treats recurring subscriptions as a strong SaaS prior', () => {
    const r = inferIndustry([tx('Office supplies')], true)
    expect(r.industry).toBe('saas')
  })

  it('returns generic with 0 confidence when there is no signal', () => {
    const r = inferIndustry([tx('ACH DEPOSIT'), tx('Misc')])
    expect(r.industry).toBe('generic')
    expect(r.confidence).toBe(0)
  })

  it('isRecurringRevenue is true only for saas', () => {
    expect(isRecurringRevenue('saas')).toBe(true)
    expect(isRecurringRevenue('restaurant')).toBe(false)
    expect(isRecurringRevenue(null)).toBe(false)
  })

  it('industryLabel falls back to a generic label', () => {
    expect(industryLabel('restaurant')).toMatch(/Restaurant/)
    expect(industryLabel(null)).toMatch(/Other/)
  })
})
