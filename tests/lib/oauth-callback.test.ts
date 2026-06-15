/**
 * Shared OAuth callback flow — the contract all 7 provider callbacks rely on:
 * exact redirect targets, tenant-scoped upsert payload, post-connect isolation.
 *
 * next/navigation's redirect() throws internally; the mock mimics that by
 * throwing an Error whose message carries the target URL. Factories must not
 * reference module consts (hoisting) — handles come from jest.requireMock.
 */
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
jest.mock('@/lib/prisma', () => ({ prisma: { integration: { upsert: jest.fn() } } }))
jest.mock('@/lib/auth', () => ({ getDefaultOrgId: jest.fn() }))

const { redirect } = jest.requireMock('next/navigation') as { redirect: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as { prisma: { integration: { upsert: jest.Mock } } }
const { getDefaultOrgId } = jest.requireMock('@/lib/auth') as { getDefaultOrgId: jest.Mock }
const upsert = prisma.integration.upsert

import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'

const CFG = {
  provider: 'QUICKBOOKS' as const,
  errorSlug: 'qbo',
  successSlug: 'quickbooks',
  label: 'QuickBooks',
}

const state = Buffer.from(JSON.stringify({ userId: 'u1' })).toString('base64')
const url = (params: Record<string, string>) =>
  `http://test/cb?${new URLSearchParams(params).toString()}`

async function run(requestUrl: string, cfg: Parameters<typeof completeOAuthCallback>[1]) {
  try {
    await completeOAuthCallback(new Request(requestUrl), cfg)
    throw new Error('expected a redirect')
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('REDIRECT:')) return msg.slice('REDIRECT:'.length)
    throw e
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  redirect.mockImplementation((url: string): never => {
    throw new Error(`REDIRECT:${url}`)
  })
  getDefaultOrgId.mockResolvedValue('org1')
})

describe('completeOAuthCallback', () => {
  it('redirects to ?error=…_denied when the provider returns an error param', async () => {
    const target = await run(url({ error: 'access_denied' }), { ...CFG, exchange: jest.fn() })
    expect(target).toBe('/integrations?error=qbo_denied')
  })

  it('redirects to ?error=…_failed on unparseable state (never throws to the user)', async () => {
    const target = await run(url({ state: '!!!not-base64-json!!!', code: 'c' }), { ...CFG, exchange: jest.fn() })
    expect(target).toBe('/integrations?error=qbo_failed')
  })

  it('upserts the integration tenant-scoped and redirects to success', async () => {
    const exchange = jest.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      realmId: 'realm9',
      expiresIn: 3600,
    })
    const target = await run(url({ state, code: 'c' }), { ...CFG, exchange })

    expect(target).toBe('/integrations?success=quickbooks')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_provider: { orgId: 'org1', provider: 'QUICKBOOKS' } },
        create: expect.objectContaining({ orgId: 'org1', status: 'CONNECTED', accessToken: 'at', realmId: 'realm9' }),
      }),
    )
    // expiresAt derived from expiresIn
    const created = upsert.mock.calls[0][0].create
    expect(created.expiresAt).toBeInstanceOf(Date)
  })

  it('omits expiresAt for non-expiring tokens (Stripe/Shopify pattern)', async () => {
    const exchange = jest.fn().mockResolvedValue({ accessToken: 'at', realmId: 'acct_1' })
    await run(url({ state, code: 'c' }), { ...CFG, exchange })
    expect(upsert.mock.calls[0][0].create.expiresAt).toBeUndefined()
  })

  it('redirects to failed when the exchange itself fails', async () => {
    const exchange = jest.fn().mockRejectedValue(new Error('provider 500'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const target = await run(url({ state, code: 'c' }), { ...CFG, exchange })
    expect(target).toBe('/integrations?error=qbo_failed')
    expect(upsert).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('a failing post-connect sync never blocks the success redirect', async () => {
    const exchange = jest.fn().mockResolvedValue({ accessToken: 'at' })
    const postConnect = jest.fn().mockRejectedValue(new Error('sync exploded'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const target = await run(url({ state, code: 'c' }), { ...CFG, exchange, postConnect })
    expect(target).toBe('/integrations?success=quickbooks')
    expect(postConnect).toHaveBeenCalledWith('org1')
    error.mockRestore()
  })

  it('enforces requireCode when configured', async () => {
    const exchange = jest.fn()
    const target = await run(url({ state }), { ...CFG, requireCode: true, exchange })
    expect(target).toBe('/integrations?error=qbo_failed')
    expect(exchange).not.toHaveBeenCalled()
  })
})
