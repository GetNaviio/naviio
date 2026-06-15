import { safeReturnPath } from '@/lib/credits/checkout'

describe('safeReturnPath (open-redirect guard on the Stripe return URL)', () => {
  it('allows in-app paths', () => {
    expect(safeReturnPath('/billing')).toBe('/billing')
    expect(safeReturnPath('/dashboard')).toBe('/dashboard')
    expect(safeReturnPath('/model/financial-analysis')).toBe('/model/financial-analysis')
  })

  it('defaults to /dashboard when missing', () => {
    expect(safeReturnPath(undefined)).toBe('/dashboard')
    expect(safeReturnPath('')).toBe('/dashboard')
  })

  it('rejects absolute and protocol-relative URLs (open redirect)', () => {
    expect(safeReturnPath('https://evil.com')).toBe('/dashboard')
    expect(safeReturnPath('//evil.com')).toBe('/dashboard')
    expect(safeReturnPath('http://evil.com/dashboard')).toBe('/dashboard')
    expect(safeReturnPath('javascript:alert(1)')).toBe('/dashboard')
  })

  it('rejects paths with query strings or fragments (params live in our own success_url)', () => {
    expect(safeReturnPath('/billing?credits=success')).toBe('/dashboard')
    expect(safeReturnPath('/billing#x')).toBe('/dashboard')
  })

  it('rejects a bare path with no leading slash', () => {
    expect(safeReturnPath('billing')).toBe('/dashboard')
  })
})
