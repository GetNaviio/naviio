/**
 * Integration catalog request route — the demand-vote endpoint that drives
 * the connector roadmap. Pins: org scoping, slug validation against the
 * catalog, idempotent voting, and the 401 contract via withOrg.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    integrationRequest: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

import { GET, POST, DELETE } from '@/app/api/integrations/request/route'
import { COMING_SOON } from '@/lib/integrations/catalog'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { integrationRequest: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock } }
}

const post = (body: unknown) =>
  new Request('http://test/api/integrations/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks wipes implementations set in factories — restore here.
  requireAuth.mockResolvedValue({ id: 'u1', email: 'u1@test.io' })
  getDefaultOrgId.mockResolvedValue('org1')
  prisma.integrationRequest.findMany.mockResolvedValue([])
  prisma.integrationRequest.upsert.mockResolvedValue({})
  prisma.integrationRequest.deleteMany.mockResolvedValue({ count: 1 })
})

describe('GET /api/integrations/request', () => {
  it('returns the org-scoped requested slugs', async () => {
    prisma.integrationRequest.findMany.mockResolvedValue([{ slug: 'square' }, { slug: 'ramp' }])
    const res = await GET(new Request('http://test/api/integrations/request'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ requested: ['square', 'ramp'] })
    expect(prisma.integrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org1' } }),
    )
  })

  it('401s when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'))
    const res = await GET(new Request('http://test/api/integrations/request'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/integrations/request', () => {
  it('records a vote for a known catalog slug, scoped to the org', async () => {
    const res = await POST(post({ slug: 'square' }))
    expect(res.status).toBe(201)
    expect(prisma.integrationRequest.upsert).toHaveBeenCalledWith({
      where: { orgId_slug: { orgId: 'org1', slug: 'square' } },
      create: { orgId: 'org1', slug: 'square' },
      update: {},
    })
  })

  it('is idempotent — re-requesting succeeds via upsert, never errors', async () => {
    await POST(post({ slug: 'square' }))
    const res = await POST(post({ slug: 'square' }))
    expect(res.status).toBe(201)
  })

  it('400s an unknown slug — votes only exist for real catalog entries', async () => {
    const res = await POST(post({ slug: 'not-a-real-tool' }))
    expect(res.status).toBe(400)
    expect(prisma.integrationRequest.upsert).not.toHaveBeenCalled()
  })

  it('400s a missing slug', async () => {
    const res = await POST(post({}))
    expect(res.status).toBe(400)
  })

  it('accepts every slug in the catalog (catalog and validator stay in sync)', async () => {
    for (const entry of COMING_SOON) {
      const res = await POST(post({ slug: entry.slug }))
      expect(res.status).toBe(201)
    }
  })
})

describe('DELETE /api/integrations/request', () => {
  it('withdraws a vote, scoped to the org', async () => {
    const res = await DELETE(
      new Request('http://test/api/integrations/request?slug=square', { method: 'DELETE' }),
    )
    expect(res.status).toBe(200)
    expect(prisma.integrationRequest.deleteMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', slug: 'square' },
    })
  })

  it('400s when slug is missing', async () => {
    const res = await DELETE(new Request('http://test/api/integrations/request', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
})

describe('catalog integrity', () => {
  it('has unique slugs', () => {
    const slugs = COMING_SOON.map((e) => e.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every entry has at least one industry tag', () => {
    for (const e of COMING_SOON) expect(e.industries.length).toBeGreaterThan(0)
  })
})
