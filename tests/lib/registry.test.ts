import { selectMetrics, type MetricContext } from '@/lib/metrics/registry'

const base: MetricContext = {
  revenue: 100000,
  cogs: 35000,
  grossProfit: 65000,
  grossMargin: 65,
  netMargin: 12,
  payroll: 25000,
  adSpend: 10000,
  refundRate: 0.02,
  customers: 50,
  cac: 200,
  orders: null,
}

describe('selectMetrics (industry packs)', () => {
  it('restaurant: prime cost = (food + labor) / sales; covers locked (no POS)', () => {
    const { visible, locked } = selectMetrics('restaurant', base)
    const prime = visible.find((v) => v.def.id === 'prime_cost')
    expect(prime?.value).toBeCloseTo(60, 5) // (35000 + 25000)/100000
    expect(visible.find((v) => v.def.id === 'food_cost')?.value).toBeCloseTo(35, 5)
    expect(visible.find((v) => v.def.id === 'labor_cost_rest')?.value).toBeCloseTo(25, 5)
    expect(locked.map((d) => d.id)).toContain('avg_check') // needs POS
  })

  it('ecommerce: contribution margin = (gross profit − ad spend) / revenue; AOV locked', () => {
    const { visible, locked } = selectMetrics('ecommerce', base)
    expect(visible.find((v) => v.def.id === 'contribution_margin')?.value).toBeCloseTo(55, 5) // (65000-10000)/100000
    expect(visible.find((v) => v.def.id === 'refund_rate')?.value).toBeCloseTo(2, 5)
    expect(locked.map((d) => d.id)).toContain('aov')
  })

  it('agency: labor ratio computable; utilization always locked (needs time-tracking)', () => {
    const { visible, locked } = selectMetrics('agency', base)
    expect(visible.find((v) => v.def.id === 'labor_ratio_agency')?.value).toBeCloseTo(25, 5)
    expect(visible.find((v) => v.def.id === 'rev_per_client')?.value).toBeCloseTo(2000, 5) // 100000/50
    expect(locked.map((d) => d.id)).toContain('utilization')
  })

  it('trades: job margin = gross margin; backlog locked', () => {
    const { visible, locked } = selectMetrics('trades', base)
    expect(visible.find((v) => v.def.id === 'job_margin')?.value).toBe(65)
    expect(locked.map((d) => d.id)).toContain('backlog')
  })

  it('rev_per_client locks when customer count is unknown', () => {
    const { visible, locked } = selectMetrics('agency', { ...base, customers: null })
    expect(visible.find((v) => v.def.id === 'rev_per_client')).toBeUndefined()
    expect(locked.map((d) => d.id)).toContain('rev_per_client')
  })
})
