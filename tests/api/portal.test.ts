/**
 * Client portal (CFO Suite) — pins: owner-only management, hashed tokens
 * never exposed, and the public read contract (revoke + expiry refuse on the
 * next view, scope filtering, identical 404 for invalid/revoked/expired so
 * there's no oracle). The snapshot builder is mocked — its correctness is the
 * metric engine's job, covered elsewhere; here we pin the access contract.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/org', () => ({ getOrgRole: jest.fn() }))
jest.mock('@/lib/portal', () => {
  const actual = jest.requireActual('@/lib/portal')
  return { ...actual, buildPortalSnapshot: jest.fn() }
})
jest.mock('@/lib/prisma', () => ({
  prisma: {
    portalShare: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

import { GET as listShares, POST as createShare } from '@/app/api/org/portal/route'
import { GET as publicRead } from '@/app/api/portal/[token]/route'
import { hashPortalToken } from '@/lib/portal'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock; getDefaultOrgId: jest.Mock
}
const { getOrgRole } = jest.requireMock('@/lib/org') as { getOrgRole: jest.Mock }
const { buildPortalSnapshot } = jest.requireMock('@/lib/portal') as { buildPortalSnapshot: jest.Mock }
const { rateLimit } = jest.requireMock('@/lib/rate-limit') as { rateLimit: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { portalShare: Record<'findMany' | 'findUnique' | 'create' | 'update' | 'updateMany', jest.Mock> }
}

const OWNER = { id: 'owner1', email: 'owner@firm.io' }
const future = () => new Date(Date.now() + 30 * 86400_000)
const past = () => new Date(Date.now() - 1000)

beforeEach(() => {
  jest.clearAllMocks()
  rateLimit.mockResolvedValue(null)
  requireAuth.mockResolvedValue(OWNER)
  getDefaultOrgId.mockResolvedValue('org1')
  getOrgRole.mockResolvedValue('OWNER')
  prisma.portalShare.create.mockResolvedValue({ id: 's1', label: 'Board view', scopes: 'pnl,cash', expiresAt: null })
  prisma.portalShare.update.mockResolvedValue({})
  buildPortalSnapshot.mockResolvedValue({ orgName: 'Acme', scopes: ['pnl'], generatedAt: 'now' })
})

const post = (url: string, body: unknown) =>
  createShare(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/org/portal — create', () => {
  it('owner gets a one-time link; only the hash is stored', async () => {
    const res = await post('http://test/api/org/portal', { label: 'Board view', scopes: ['pnl', 'cash'] })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.portalUrl).toMatch(/^http:\/\/test\/portal\/[A-Za-z0-9_-]{20,}$/)
    const raw = body.portalUrl.split('/portal/')[1]
    const createArg = prisma.portalShare.create.mock.calls[0][0]
    expect(createArg.data.tokenHash).toBe(hashPortalToken(raw))
    expect(body.portalUrl).not.toContain(createArg.data.tokenHash)
  })

  it('403s for a non-owner', async () => {
    getOrgRole.mockResolvedValue('MEMBER')
    const res = await post('http://test/api/org/portal', { label: 'Board view', scopes: ['pnl'] })
    expect(res.status).toBe(403)
    expect(prisma.portalShare.create).not.toHaveBeenCalled()
  })

  it('400s when no section is selected', async () => {
    const res = await post('http://test/api/org/portal', { label: 'Empty', scopes: [] })
    expect(res.status).toBe(400)
  })

  it('GET list never exposes tokens', async () => {
    prisma.portalShare.findMany.mockResolvedValue([
      { id: 's1', label: 'Board', scopes: 'pnl,cash', expiresAt: future(), revokedAt: null, lastViewedAt: null, viewCount: 3, createdAt: new Date() },
    ])
    const body = await (await listShares(new Request('http://test/api/org/portal'))).json()
    expect(body.shares[0]).toMatchObject({ scopes: ['pnl', 'cash'], active: true, viewCount: 3 })
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|token/i)
  })
})

describe('GET /api/portal/[token] — public read', () => {
  const read = (token: string) => publicRead(new Request(`http://test/api/portal/${token}`))

  it('returns the scoped snapshot for a live link and bumps view telemetry', async () => {
    prisma.portalShare.findUnique.mockResolvedValue({
      id: 's1', orgId: 'org1', scopes: 'pnl', revokedAt: null, expiresAt: future(),
      org: { name: 'Acme', brandLogoUrl: 'https://acme.com/l.png', brandColor: '#123456', hideNaviioBranding: true },
    })
    const res = await read('x'.repeat(43))
    expect(res.status).toBe(200)
    expect((await res.json()).orgName).toBe('Acme')
    // 4th arg: branding resolved from the org row (white-label, §AI)
    expect(buildPortalSnapshot).toHaveBeenCalledWith('org1', 'Acme', ['pnl'], {
      logoUrl: 'https://acme.com/l.png', color: '#123456', hideNaviioBranding: true,
    })
    expect(prisma.portalShare.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: { lastViewedAt: expect.any(Date), viewCount: { increment: 1 } },
    }))
  })

  it('404s a revoked link without computing a snapshot', async () => {
    prisma.portalShare.findUnique.mockResolvedValue({
      id: 's1', orgId: 'org1', scopes: 'pnl', revokedAt: new Date(), expiresAt: null, org: { name: 'Acme' },
    })
    const res = await read('x'.repeat(43))
    expect(res.status).toBe(404)
    expect(buildPortalSnapshot).not.toHaveBeenCalled()
  })

  it('404s an expired link', async () => {
    prisma.portalShare.findUnique.mockResolvedValue({
      id: 's1', orgId: 'org1', scopes: 'pnl', revokedAt: null, expiresAt: past(), org: { name: 'Acme' },
    })
    expect((await read('x'.repeat(43))).status).toBe(404)
    expect(buildPortalSnapshot).not.toHaveBeenCalled()
  })

  it('404s an unknown token with the same shape (no oracle)', async () => {
    prisma.portalShare.findUnique.mockResolvedValue(null)
    const res = await read('x'.repeat(43))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'This link is no longer available' })
  })

  it('looks up by hash, never the raw token', async () => {
    prisma.portalShare.findUnique.mockResolvedValue(null)
    await read('rawtoken123456789012')
    expect(prisma.portalShare.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashPortalToken('rawtoken123456789012') },
    }))
  })
})
