/**
 * Session vs pre-auth (MFA-pending) token separation — the core invariant of
 * the MFA design: a pre-auth token must NEVER be accepted as a session, and a
 * session token must never satisfy a pre-auth check (SEC-ATT-001).
 */
process.env.JWT_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

import jwt from 'jsonwebtoken'
import { signToken, verifyToken, signPreAuthToken, verifyPreAuthToken } from '@/lib/auth'

const PAYLOAD = { userId: 'u1', email: 'u1@test.io' }

describe('session tokens', () => {
  it('round-trip: signToken → verifyToken', () => {
    expect(verifyToken(signToken(PAYLOAD))).toEqual(PAYLOAD)
  })

  it('rejects garbage and wrong-secret tokens', () => {
    expect(verifyToken('not-a-jwt')).toBeNull()
    const foreign = jwt.sign(PAYLOAD, 'some-other-secret')
    expect(verifyToken(foreign)).toBeNull()
  })

  it('CRITICAL: a pre-auth token is never a valid session', () => {
    expect(verifyToken(signPreAuthToken(PAYLOAD))).toBeNull()
  })

  it('CRITICAL: a hand-forged mfaPending claim cannot make a session', () => {
    const forged = jwt.sign({ ...PAYLOAD, mfaPending: true }, process.env.JWT_SECRET!)
    expect(verifyToken(forged)).toBeNull()
  })
})

describe('pre-auth tokens', () => {
  it('round-trip: signPreAuthToken → verifyPreAuthToken', () => {
    expect(verifyPreAuthToken(signPreAuthToken(PAYLOAD))).toEqual(PAYLOAD)
  })

  it('a full session token never satisfies the pre-auth check', () => {
    expect(verifyPreAuthToken(signToken(PAYLOAD))).toBeNull()
  })

  it('expired pre-auth tokens are rejected', () => {
    const expired = jwt.sign({ ...PAYLOAD, mfaPending: true }, process.env.JWT_SECRET!, { expiresIn: -1 })
    expect(verifyPreAuthToken(expired)).toBeNull()
  })
})
