/**
 * Rate limiter — memory path (no REDIS_URL in tests). Each test uses a unique
 * IP because counters are module-level and shared across tests in this file.
 */
import { rateLimit, clientIp, LIMITS } from '@/lib/rate-limit'

const req = (ip: string) => new Request('http://test/', { headers: { 'x-forwarded-for': ip } })

describe('rateLimit', () => {
  it('allows requests up to the bucket limit, then 429s', async () => {
    const ip = '10.0.0.1'
    for (let i = 0; i < LIMITS.login.limit; i++) {
      expect(await rateLimit(req(ip), 'login')).toBeNull()
    }
    const blocked = await rateLimit(req(ip), 'login')
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
  })

  it('includes Retry-After and rate-limit headers on 429', async () => {
    const ip = '10.0.0.2'
    for (let i = 0; i < LIMITS.register.limit; i++) await rateLimit(req(ip), 'register')
    const blocked = (await rateLimit(req(ip), 'register'))!
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('isolates buckets per IP', async () => {
    const a = '10.0.0.3'
    for (let i = 0; i < LIMITS.mfa.limit + 1; i++) await rateLimit(req(a), 'mfa')
    expect(await rateLimit(req('10.0.0.4'), 'mfa')).toBeNull()
  })

  it('isolates buckets per name (login burst must not block waitlist)', async () => {
    const ip = '10.0.0.5'
    for (let i = 0; i < LIMITS.login.limit + 1; i++) await rateLimit(req(ip), 'login')
    expect(await rateLimit(req(ip), 'waitlist')).toBeNull()
  })

  it('falls back to a shared bucket when no client IP headers exist', () => {
    expect(clientIp(new Request('http://test/'))).toBe('unknown')
  })

  it('uses the first hop of x-forwarded-for (set by the trusted proxy)', () => {
    const r = new Request('http://test/', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(clientIp(r)).toBe('1.2.3.4')
  })
})
