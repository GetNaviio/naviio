/**
 * Metered Plaid refresh — charge → refresh → refund-on-failure. Pins the
 * BUG_HUNT §1.2 fix: a refund failure must not crash the handler, must report
 * the truthful (post-charge) balance, and must log for reconciliation.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ id: 'u1', email: 'u1@test.io' }),
  getDefaultOrgId: jest.fn().mockResolvedValue('org1'),
}))
jest.mock('@/lib/credits/account', () => {
  // Real error class so the route's `instanceof` check works.
  class InsufficientCreditsError extends Error {
    constructor(public needed: number, public balance: number) {
      super('INSUFFICIENT_CREDITS')
    }
  }
  return { chargeCredits: jest.fn(), addCredits: jest.fn(), InsufficientCreditsError }
})
jest.mock('@/lib/integrations/plaid', () => ({ refreshTransactions: jest.fn() }))

import { POST } from '@/app/api/plaid/refresh/route'
import { InsufficientCreditsError } from '@/lib/credits/account'

const { chargeCredits, addCredits } = jest.requireMock('@/lib/credits/account') as {
  chargeCredits: jest.Mock
  addCredits: jest.Mock
}
const { refreshTransactions } = jest.requireMock('@/lib/integrations/plaid') as { refreshTransactions: jest.Mock }
const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}

const request = () => new Request('http://test/api/plaid/refresh', { method: 'POST' })

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks wipes the factory's resolved values — restore per test.
  requireAuth.mockResolvedValue({ id: 'u1', email: 'u1@test.io' })
  getDefaultOrgId.mockResolvedValue('org1')
})

describe('POST /api/plaid/refresh', () => {
  it('charges, refreshes, and returns the post-charge balance on success', async () => {
    chargeCredits.mockResolvedValue(9)
    refreshTransactions.mockResolvedValue({ synced: 12 })

    const res = await POST(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, balance: 9, synced: 12 })
    expect(addCredits).not.toHaveBeenCalled() // no refund on success
  })

  it('402s without charging when credits are insufficient', async () => {
    chargeCredits.mockRejectedValue(new InsufficientCreditsError(1, 0))
    const res = await POST(request())
    expect(res.status).toBe(402)
    expect(refreshTransactions).not.toHaveBeenCalled()
  })

  it('refunds when the refresh fails (user never pays for a failed refresh)', async () => {
    chargeCredits.mockResolvedValue(9)
    refreshTransactions.mockRejectedValue(new Error('plaid 500'))
    addCredits.mockResolvedValue(10)

    const res = await POST(request())
    expect(res.status).toBe(502)
    expect(addCredits).toHaveBeenCalledWith('org1', expect.any(Number), 'refund', { feature: 'realtime_refresh' })
    expect((await res.json()).balance).toBe(10) // refunded balance
  })

  it('CRITICAL: refund failure does not crash — truthful balance + reconciliation log', async () => {
    chargeCredits.mockResolvedValue(9)
    refreshTransactions.mockRejectedValue(new Error('plaid 500'))
    addCredits.mockRejectedValue(new Error('db down mid-refund'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request())
    expect(res.status).toBe(502) // structured error, not an unhandled 500
    expect((await res.json()).balance).toBe(9) // post-charge truth, not a phantom refund
    expect(error.mock.calls.some((c) => String(c[0]).includes('REFUND FAILED'))).toBe(true)
    error.mockRestore()
  })

  it('400s with plaid_not_connected when no Plaid item exists (still refunds)', async () => {
    chargeCredits.mockResolvedValue(9)
    refreshTransactions.mockRejectedValue(new Error('PLAID_NOT_CONNECTED'))
    addCredits.mockResolvedValue(10)

    const res = await POST(request())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('plaid_not_connected')
  })
})
