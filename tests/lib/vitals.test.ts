import { deriveVitals } from '@/lib/firm/vitals'

const ok = { netMargin: 18, revenueGrowth: 4, runwayMonths: 14, industry: 'saas' as const, hasData: true, hasAccess: true }

describe('deriveVitals (advisor portfolio triage)', () => {
  it('no access → needs_reconnect, no score', () => {
    const v = deriveVitals({ ...ok, hasAccess: false })
    expect(v.status).toBe('needs_reconnect')
    expect(v.score).toBeNull()
    expect(v.alerts[0]).toMatch(/revoked/i)
  })

  it('no data → no_data with a connect prompt', () => {
    const v = deriveVitals({ ...ok, hasData: false })
    expect(v.status).toBe('no_data')
    expect(v.alerts[0]).toMatch(/connect/i)
  })

  it('a healthy client scores and has no alerts', () => {
    const v = deriveVitals(ok)
    expect(v.status).toBe('healthy')
    expect(v.score).toBeGreaterThan(0)
    expect(v.alerts).toHaveLength(0)
  })

  it('flags low runway as at-risk', () => {
    const v = deriveVitals({ ...ok, runwayMonths: 2 })
    expect(v.status).toBe('at_risk')
    expect(v.alerts.some((a) => /runway under 3/i.test(a))).toBe(true)
  })

  it('flags an operating loss as at-risk', () => {
    const v = deriveVitals({ ...ok, netMargin: -25 })
    expect(v.status).toBe('at_risk')
    expect(v.alerts.some((a) => /loss/i.test(a))).toBe(true)
  })

  it('mid-runway is a watch, not at-risk', () => {
    const v = deriveVitals({ ...ok, runwayMonths: 5 })
    expect(v.status).toBe('watch')
  })

  it('cash-positive (Infinity runway) is fine', () => {
    const v = deriveVitals({ ...ok, runwayMonths: Infinity })
    expect(v.status).toBe('healthy')
    expect(v.alerts).toHaveLength(0)
  })
})
