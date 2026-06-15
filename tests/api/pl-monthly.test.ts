/**
 * /api/pl/monthly — the P&L drill-down feed. Pins: month bucketing over the
 * 24-month window, one-classifier-everywhere (delegates to incomeStatement),
 * ascending month order, and the trust-layer meta (partial current month +
 * per-source freshness).
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: { integration: { findMany: jest.fn() } },
}))
jest.mock('@/lib/metrics/ledger', () => ({
  loadPrimaryLedger: jest.fn(),
  categoryOverrides: jest.fn().mockResolvedValue({}),
  monthsAgoUTC: jest.fn((n: number) => new Date(Date.UTC(2026, 5 - n, 1))),
}))
jest.mock('@/lib/metrics/compute', () => ({
  incomeStatement: jest.fn(),
}))

import { GET } from '@/app/api/pl/monthly/route'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { integration: { findMany: jest.Mock } }
}
const { loadPrimaryLedger, categoryOverrides } = jest.requireMock('@/lib/metrics/ledger') as {
  loadPrimaryLedger: jest.Mock
  categoryOverrides: jest.Mock
}
const { incomeStatement } = jest.requireMock('@/lib/metrics/compute') as {
  incomeStatement: jest.Mock
}

const txn = (iso: string, amount: number) => ({ date: new Date(iso), amount })

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ id: 'u1', email: 'u1@test.io' })
  getDefaultOrgId.mockResolvedValue('org1')
  categoryOverrides.mockResolvedValue({}) // clearAllMocks wipes the factory impl
  prisma.integration.findMany.mockResolvedValue([
    { provider: 'PLAID', lastSyncedAt: new Date('2026-06-11T08:00:00Z') },
    { provider: 'STRIPE', lastSyncedAt: null },
  ])
  // Stub statement: income = sum of positive amounts in the bucket.
  incomeStatement.mockImplementation((txns: { amount: number }[]) => {
    const income = txns.reduce((s, t) => s + Math.max(t.amount, 0), 0)
    return { totalIncome: income, totalExpenses: 0, netIncome: income, netMargin: 100, expensesByCategory: [] }
  })
})

describe('GET /api/pl/monthly', () => {
  it('buckets the ledger by month, ascending, one classifier call per bucket', async () => {
    loadPrimaryLedger.mockResolvedValue([
      txn('2026-05-15T00:00:00Z', 100),
      txn('2025-05-02T00:00:00Z', 40),
      txn('2026-05-20T00:00:00Z', 60),
      txn('2024-12-31T00:00:00Z', 7),
    ])
    const res = await GET(new Request('http://test/api/pl/monthly'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.months.map((m: { month: string }) => m.month)).toEqual(['2024-12', '2025-05', '2026-05'])
    const may26 = body.months.find((m: { month: string }) => m.month === '2026-05')
    expect(may26.income).toBe(160) // both May-2026 rows landed in one bucket
    expect(incomeStatement).toHaveBeenCalledTimes(3)
    expect(body.hasData).toBe(true)
  })

  it('carries the trust meta: partial current month + per-source freshness', async () => {
    loadPrimaryLedger.mockResolvedValue([txn('2026-06-01T00:00:00Z', 10)])
    const body = await (await GET(new Request('http://test/api/pl/monthly'))).json()
    expect(body.meta.currentMonthIsPartial).toBe(true)
    expect(body.meta.currentMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(body.meta.sources).toEqual([
      { provider: 'PLAID', lastSyncedAt: '2026-06-11T08:00:00.000Z' },
      { provider: 'STRIPE', lastSyncedAt: null },
    ])
  })

  it('returns hasData: false on an empty ledger', async () => {
    loadPrimaryLedger.mockResolvedValue([])
    const body = await (await GET(new Request('http://test/api/pl/monthly'))).json()
    expect(body.months).toEqual([])
    expect(body.hasData).toBe(false)
  })

  it('401s when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'))
    const res = await GET(new Request('http://test/api/pl/monthly'))
    expect(res.status).toBe(401)
  })
})
