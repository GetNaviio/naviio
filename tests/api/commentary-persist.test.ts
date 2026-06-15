/**
 * Commentary persistence — the user PAYS for generation, so the output must
 * be durable. Pins: GET returns the latest saved commentary (org-scoped),
 * empty state is a clean null, and the 401 contract holds.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: { report: { findFirst: jest.fn(), create: jest.fn() } },
}))
jest.mock('@anthropic-ai/sdk', () => jest.fn())
jest.mock('@/lib/credits/account', () => ({
  chargeCredits: jest.fn(),
  addCredits: jest.fn(),
  InsufficientCreditsError: class extends Error {},
}))
jest.mock('@/lib/credits/rates', () => ({ costOf: jest.fn(() => 2) }))
jest.mock('@/lib/metrics/ledger', () => ({
  loadPrimaryLedger: jest.fn(),
  startOfYearUTC: jest.fn(() => new Date('2026-01-01T00:00:00Z')),
}))
jest.mock('@/lib/metrics/compute', () => ({ cashFlow: jest.fn(), runwayMonths: jest.fn() }))
jest.mock('@/lib/integrations/plaid', () => ({ getCashBalance: jest.fn() }))
jest.mock('@/lib/model/incomeStatement', () => ({ modelIncomeStatement: jest.fn() }))
jest.mock('@/lib/naviFormat', () => ({ cleanNaviText: jest.fn((s: string) => s) }))

import { GET } from '@/app/api/model/commentary/route'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { report: { findFirst: jest.Mock; create: jest.Mock } }
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ id: 'u1', email: 'u1@test.io' })
  getDefaultOrgId.mockResolvedValue('org1')
})

describe('GET /api/model/commentary', () => {
  it('returns the latest saved commentary, scoped to the org', async () => {
    prisma.report.findFirst.mockResolvedValue({
      data: { commentary: 'Revenue grew 12% — margins held.' },
      generatedAt: new Date('2026-06-10T15:00:00Z'),
    })
    const res = await GET(new Request('http://test/api/model/commentary'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      commentary: 'Revenue grew 12% — margins held.',
      generatedAt: '2026-06-10T15:00:00.000Z',
    })
    expect(prisma.report.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org1', type: 'COMMENTARY' },
        orderBy: { generatedAt: 'desc' },
      }),
    )
  })

  it('returns null cleanly when nothing has been generated yet', async () => {
    prisma.report.findFirst.mockResolvedValue(null)
    const body = await (await GET(new Request('http://test/api/model/commentary'))).json()
    expect(body).toEqual({ commentary: null, generatedAt: null })
  })

  it('tolerates malformed stored data (returns null, never throws)', async () => {
    prisma.report.findFirst.mockResolvedValue({ data: 'not-an-object', generatedAt: new Date() })
    const res = await GET(new Request('http://test/api/model/commentary'))
    expect(res.status).toBe(200)
    expect((await res.json()).commentary).toBeNull()
  })

  it('401s when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'))
    const res = await GET(new Request('http://test/api/model/commentary'))
    expect(res.status).toBe(401)
  })
})
