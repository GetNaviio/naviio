/**
 * Credits webhook route — the path where money is received. Pins the fixes
 * from BUG_HUNT §1.1: unresolvable paid sessions are logged (not silently
 * dropped), and persistence failures 500 so Stripe retries.
 *
 * NOTE: jest.mock factories must not reference module-level consts (they're
 * hoisted above them) — mocks are created inside the factories and retrieved
 * with jest.requireMock.
 */
jest.mock('@/lib/credits/checkout', () => ({ constructCreditsEvent: jest.fn() }))
jest.mock('@/lib/credits/account', () => ({ recordPurchase: jest.fn() }))
jest.mock('@/lib/credits/rates', () => ({ packById: jest.fn() }))

import { POST } from '@/app/api/credits/webhook/route'

const { constructCreditsEvent } = jest.requireMock('@/lib/credits/checkout') as { constructCreditsEvent: jest.Mock }
const { recordPurchase } = jest.requireMock('@/lib/credits/account') as { recordPurchase: jest.Mock }
const { packById } = jest.requireMock('@/lib/credits/rates') as { packById: jest.Mock }

const request = (body = '{}') =>
  new Request('http://test/api/credits/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body,
  })

const paidSession = (metadata: Record<string, string> | null) => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_status: 'paid', metadata } },
})

beforeEach(() => jest.clearAllMocks())

describe('POST /api/credits/webhook', () => {
  it('400s when the signature header is missing', async () => {
    const res = await POST(new Request('http://test/', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(400)
  })

  it('400s when signature verification fails — never processes the event', async () => {
    constructCreditsEvent.mockImplementation(() => { throw new Error('bad sig') })
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(request())
    expect(res.status).toBe(400)
    expect(recordPurchase).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('grants credits for a valid paid session', async () => {
    constructCreditsEvent.mockReturnValue(paidSession({ orgId: 'org1', packId: 'starter' }))
    packById.mockReturnValue({ id: 'starter', credits: 100 })
    recordPurchase.mockResolvedValue({ granted: true, balance: 100 })

    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(recordPurchase).toHaveBeenCalledWith('org1', 100, 'cs_1')
  })

  it('acks 200 but logs UNRESOLVED for a paid session with unknown pack (money received, manual reconciliation)', async () => {
    constructCreditsEvent.mockReturnValue(paidSession({ orgId: 'org1', packId: 'pack-from-newer-deploy' }))
    packById.mockReturnValue(undefined)
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request())
    expect(res.status).toBe(200) // retrying can't fix bad metadata
    expect(recordPurchase).not.toHaveBeenCalled()
    expect(error.mock.calls.some((c) => String(c[0]).includes('credits_unresolved_purchase'))).toBe(true)
    error.mockRestore()
  })

  it('500s when persistence fails — Stripe must retry (idempotent on stripeRef)', async () => {
    constructCreditsEvent.mockReturnValue(paidSession({ orgId: 'org1', packId: 'starter' }))
    packById.mockReturnValue({ id: 'starter', credits: 100 })
    recordPurchase.mockRejectedValue(new Error('db down'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request())
    expect(res.status).toBe(500)
    error.mockRestore()
  })

  it('ignores unpaid sessions and unrelated event types', async () => {
    constructCreditsEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'unpaid', metadata: { orgId: 'o', packId: 'p' } } },
    })
    expect((await POST(request())).status).toBe(200)
    expect(recordPurchase).not.toHaveBeenCalled()

    constructCreditsEvent.mockReturnValue({ type: 'invoice.created', data: { object: {} } })
    expect((await POST(request())).status).toBe(200)
    expect(recordPurchase).not.toHaveBeenCalled()
  })
})
