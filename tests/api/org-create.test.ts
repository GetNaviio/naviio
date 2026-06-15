/**
 * Multi-entity (CFO Suite) — pins the business rules: creating client
 * entities requires owning a CFO-plan org; new entities are CFO-plan and
 * become active immediately; rename is owner-only; the switch listing
 * advertises canCreate with the same rule the create route enforces.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    orgMember: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { update: jest.fn() },
  },
}))

import { POST as createOrg } from '@/app/api/org/create/route'
import { PATCH as renameOrg } from '@/app/api/org/route'
import { GET as listOrgs } from '@/app/api/org/switch/route'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { rateLimit } = jest.requireMock('@/lib/rate-limit') as { rateLimit: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    organization: Record<'count' | 'create' | 'update' | 'findUnique' | 'findMany', jest.Mock>
    orgMember: Record<'findUnique' | 'findMany', jest.Mock>
    user: Record<'update', jest.Mock>
  }
}

const USER = { id: 'cfo1', email: 'cfo@firm.io' }

beforeEach(() => {
  jest.clearAllMocks()
  rateLimit.mockResolvedValue(null) // clearAllMocks wipes the factory impl
  requireAuth.mockResolvedValue(USER)
  getDefaultOrgId.mockResolvedValue('org1')
  prisma.organization.create.mockResolvedValue({ id: 'org2', name: 'Client LLC' })
  prisma.user.update.mockResolvedValue({})
})

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown, method = 'POST') =>
  handler(new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/org/create', () => {
  it('CFO-plan owner creates a CFO-plan entity and lands in it', async () => {
    prisma.organization.count.mockResolvedValue(1) // owns a CFO org
    const res = await post(createOrg, 'http://test/api/org/create', { name: 'Client LLC' })
    expect(res.status).toBe(201)
    expect((await res.json()).orgId).toBe('org2')
    expect(prisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'Client LLC', userId: 'cfo1', plan: 'CFO' },
    }))
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'cfo1' }, data: { activeOrgId: 'org2' } })
  })

  it('403s with CFO_REQUIRED for non-CFO owners', async () => {
    prisma.organization.count.mockResolvedValue(0)
    const res = await post(createOrg, 'http://test/api/org/create', { name: 'Client LLC' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CFO_REQUIRED')
    expect(prisma.organization.create).not.toHaveBeenCalled()
  })

  it('400s on a too-short name', async () => {
    prisma.organization.count.mockResolvedValue(1)
    expect((await post(createOrg, 'http://test/api/org/create', { name: 'X' })).status).toBe(400)
  })
})

describe('PATCH /api/org — rename', () => {
  it('owner renames the active org', async () => {
    prisma.organization.findUnique.mockResolvedValue({ userId: 'cfo1' }) // getOrgRole → OWNER
    prisma.organization.update.mockResolvedValue({ id: 'org1', name: 'New Name' })
    const res = await post(renameOrg, 'http://test/api/org', { name: 'New Name' }, 'PATCH')
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org1' },
      data: { name: 'New Name' },
    }))
  })

  it('403s for members', async () => {
    prisma.organization.findUnique.mockResolvedValue({ userId: 'someone-else' })
    prisma.orgMember.findUnique.mockResolvedValue({ role: 'MEMBER' })
    const res = await post(renameOrg, 'http://test/api/org', { name: 'Hijacked' }, 'PATCH')
    expect(res.status).toBe(403)
    expect(prisma.organization.update).not.toHaveBeenCalled()
  })
})

describe('GET /api/org/switch — canCreate flag', () => {
  it('mirrors the create rule: true only when a CFO-plan org is owned', async () => {
    prisma.orgMember.findMany.mockResolvedValue([])
    prisma.organization.findMany.mockResolvedValue([{ id: 'org1', name: 'My Firm', plan: 'CFO' }])
    let body = await (await listOrgs(new Request('http://test/api/org/switch'))).json()
    expect(body.canCreate).toBe(true)
    expect(body.orgs[0]).toMatchObject({ id: 'org1', role: 'OWNER', active: true })

    prisma.organization.findMany.mockResolvedValue([{ id: 'org1', name: 'My Firm', plan: 'GROWTH' }])
    body = await (await listOrgs(new Request('http://test/api/org/switch'))).json()
    expect(body.canCreate).toBe(false)
  })
})
