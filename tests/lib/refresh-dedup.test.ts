/**
 * Token refresh — in-flight dedup: concurrent requests for the same expiring
 * integration must share ONE provider refresh call (no duplicate refreshes,
 * no last-write-wins races within a process).
 */
jest.mock('@/lib/prisma', () => ({ prisma: { integration: { update: jest.fn(), findUnique: jest.fn() } } }))

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as {
  prisma: { integration: { update: jest.Mock; findUnique: jest.Mock } }
}
const update = prismaMock.integration.update

import { getValidToken } from '@/lib/integrations/refreshToken'
import type { Integration } from '@prisma/client'

const integration = (over: Partial<Integration> = {}): Integration =>
  ({
    id: 'int1',
    orgId: 'org1',
    provider: 'QUICKBOOKS',
    accessToken: 'old-token',
    refreshToken: 'refresh-1',
    realmId: null,
    itemId: null,
    transactionCursor: null,
    expiresAt: new Date(Date.now() + 60_000), // expires in 1 min → within refresh buffer
    lastSyncedAt: null,
    status: 'CONNECTED',
    newAccountsAvailable: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Integration

const fetchSpy = jest.spyOn(globalThis, 'fetch') as jest.SpiedFunction<typeof fetch>

beforeEach(() => {
  jest.clearAllMocks()
  update.mockResolvedValue({})
})
afterAll(() => fetchSpy.mockRestore())

function mockRefreshResponse() {
  fetchSpy.mockImplementation(async () =>
    new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'refresh-2', expires_in: 3600 }), {
      status: 200,
    }),
  )
}

describe('getValidToken', () => {
  it('returns the stored token untouched when not near expiry', async () => {
    const token = await getValidToken(integration({ expiresAt: new Date(Date.now() + 60 * 60_000) }))
    expect(token).toBe('old-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes near expiry and persists the rotated tokens', async () => {
    mockRefreshResponse()
    const token = await getValidToken(integration())
    expect(token).toBe('new-token')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'int1' },
        data: expect.objectContaining({ accessToken: 'new-token', refreshToken: 'refresh-2' }),
      }),
    )
  })

  it('CRITICAL: concurrent callers share ONE refresh (in-flight dedup)', async () => {
    mockRefreshResponse()
    const i = integration({ id: 'int-concurrent' })
    const [a, b, c] = await Promise.all([getValidToken(i), getValidToken(i), getValidToken(i)])
    expect(a).toBe('new-token')
    expect(b).toBe('new-token')
    expect(c).toBe('new-token')
    expect(fetchSpy).toHaveBeenCalledTimes(1) // not 3
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('providers without refresh config (Plaid) return the stored token', async () => {
    const token = await getValidToken(integration({ provider: 'PLAID', id: 'int-plaid' }))
    expect(token).toBe('old-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces provider refresh failures (caller marks status ERROR)', async () => {
    fetchSpy.mockImplementation(async () => new Response('nope', { status: 401 }))
    await expect(getValidToken(integration({ id: 'int-fail' }))).rejects.toThrow(/refresh failed: 401/)
  })
})
