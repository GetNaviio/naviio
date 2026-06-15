import { validateEnv } from '@/lib/env'

const env = process.env as Record<string, string | undefined>

// Snapshot/restore everything we touch so this file can't leak into others.
const KEYS = ['NODE_ENV', 'NEXT_PHASE', 'DATABASE_URL', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'PLAID_CLIENT_ID', 'PLAID_SECRET']
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]))
  for (const k of KEYS) delete env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k]
    else env[k] = saved[k]
  }
})

describe('validateEnv', () => {
  it('throws in production when required vars are missing', () => {
    env.NODE_ENV = 'production'
    expect(() => validateEnv()).toThrow(/invalid configuration/)
  })

  it('rejects weak JWT_SECRET (<32 chars) in production', () => {
    env.NODE_ENV = 'production'
    env.DATABASE_URL = 'postgresql://u:p@h/db'
    env.JWT_SECRET = 'too-short'
    env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64)
    expect(() => validateEnv()).toThrow(/JWT_SECRET/)
  })

  it('passes in production with a complete, well-shaped config', () => {
    env.NODE_ENV = 'production'
    env.DATABASE_URL = 'postgresql://u:p@h/db'
    env.JWT_SECRET = 'x'.repeat(32)
    env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64)
    expect(() => validateEnv()).not.toThrow()
  })

  it('does not throw in development (demo mode keeps working)', () => {
    env.NODE_ENV = 'development'
    expect(() => validateEnv()).not.toThrow()
  })

  it('skips entirely during `next build` (stub-secret builds must pass)', () => {
    env.NODE_ENV = 'production'
    env.NEXT_PHASE = 'phase-production-build'
    expect(() => validateEnv()).not.toThrow()
  })

  it('warns (never throws) on partially-configured provider groups', () => {
    env.NODE_ENV = 'development'
    env.PLAID_CLIENT_ID = 'set'
    // PLAID_SECRET missing
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    validateEnv()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('plaid'))).toBe(true)
    warn.mockRestore()
  })
})
