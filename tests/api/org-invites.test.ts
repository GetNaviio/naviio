/**
 * Multi-user & invites — the seats the pricing page sells. Pins the invite
 * lifecycle (owner-only create, hashed token, seat limits), the accept
 * contract (email must match, expiry honored, membership created atomically),
 * and member removal guards (owner can never be removed).
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
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    orgMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { POST as createInvite, GET as listInvites } from '@/app/api/org/invites/route'
import { POST as acceptInvite } from '@/app/api/org/invites/accept/route'
import { GET as getMembers, DELETE as removeMember } from '@/app/api/org/members/route'
import { hashInviteToken, SEAT_LIMITS } from '@/lib/org'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { rateLimit } = jest.requireMock('@/lib/rate-limit') as { rateLimit: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    organization: Record<'findUnique' | 'findUniqueOrThrow' | 'findFirst' | 'findMany', jest.Mock>
    orgMember: Record<'findUnique' | 'findFirst' | 'findMany' | 'count' | 'create' | 'delete', jest.Mock>
    invitation: Record<'findUnique' | 'findMany' | 'upsert' | 'count' | 'deleteMany' | 'update', jest.Mock>
    user: Record<'update' | 'updateMany', jest.Mock>
    $transaction: jest.Mock
  }
}

const OWNER = { id: 'owner1', email: 'owner@acme.io' }
const ORG = { name: 'Acme', userId: 'owner1', plan: 'GROWTH', owner: { id: 'owner1', email: 'owner@acme.io', name: 'Owner' } }
const future = () => new Date(Date.now() + 7 * 86400_000)

beforeEach(() => {
  jest.clearAllMocks()
  rateLimit.mockResolvedValue(null) // clearAllMocks wipes the factory impl
  requireAuth.mockResolvedValue(OWNER)
  getDefaultOrgId.mockResolvedValue('org1')
  prisma.organization.findUnique.mockResolvedValue({ userId: 'owner1' }) // getOrgRole
  prisma.organization.findUniqueOrThrow.mockResolvedValue(ORG)
  prisma.orgMember.findUnique.mockResolvedValue(null)
  prisma.orgMember.findFirst.mockResolvedValue(null)
  prisma.orgMember.findMany.mockResolvedValue([])
  prisma.orgMember.count.mockResolvedValue(0)
  prisma.invitation.findUnique.mockResolvedValue(null)
  prisma.invitation.count.mockResolvedValue(0)
  prisma.invitation.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: 'inv1', email: create.email, role: 'MEMBER', expiresAt: future(),
  }))
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]))
})

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/org/invites — create', () => {
  it('owner gets a one-time link whose token is stored only as a hash', async () => {
    const res = await post(createInvite, 'http://test/api/org/invites', { email: 'Jane@Acme.io' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.inviteUrl).toMatch(/^http:\/\/test\/invite\/[A-Za-z0-9_-]{20,}$/)

    const raw = body.inviteUrl.split('/invite/')[1]
    const upsertArg = prisma.invitation.upsert.mock.calls[0][0]
    expect(upsertArg.create.tokenHash).toBe(hashInviteToken(raw)) // never the raw token
    expect(upsertArg.create.email).toBe('jane@acme.io') // normalized
    expect(body.inviteUrl).not.toContain(upsertArg.create.tokenHash)
  })

  it('403s for a non-owner member', async () => {
    requireAuth.mockResolvedValue({ id: 'u2', email: 'member@acme.io' })
    prisma.organization.findUnique.mockResolvedValue({ userId: 'owner1' })
    prisma.orgMember.findUnique.mockResolvedValue({ role: 'MEMBER' })
    const res = await post(createInvite, 'http://test/api/org/invites', { email: 'x@y.io' })
    expect(res.status).toBe(403)
    expect(prisma.invitation.upsert).not.toHaveBeenCalled()
  })

  it('enforces the plan seat limit (Growth = 3, counting live invites)', async () => {
    expect(SEAT_LIMITS.GROWTH).toBe(3)
    prisma.orgMember.count.mockResolvedValue(1) // owner + 1 member
    prisma.invitation.count.mockResolvedValue(1) // + 1 pending invite = 3 used
    const res = await post(createInvite, 'http://test/api/org/invites', { email: 'x@y.io' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SEAT_LIMIT')
  })

  it('409s when the email is already on the team', async () => {
    prisma.orgMember.findFirst.mockResolvedValue({ id: 'm1' })
    const res = await post(createInvite, 'http://test/api/org/invites', { email: 'jane@acme.io' })
    expect(res.status).toBe(409)
  })

  it('listing pending invites never exposes tokens', async () => {
    prisma.invitation.findMany.mockResolvedValue([
      { id: 'inv1', email: 'jane@acme.io', role: 'MEMBER', expiresAt: future(), createdAt: new Date() },
    ])
    const body = await (await listInvites(new Request('http://test/api/org/invites'))).json()
    expect(body.invites).toHaveLength(1)
    expect(JSON.stringify(body)).not.toMatch(/token/i)
  })
})

describe('POST /api/org/invites/accept', () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    id: 'inv1', orgId: 'org1', email: 'jane@acme.io', role: 'MEMBER',
    expiresAt: future(), acceptedAt: null,
    org: { name: 'Acme', userId: 'owner1', plan: 'GROWTH' },
    ...over,
  })

  it('matching email joins: membership + acceptedAt + activeOrgId in one transaction', async () => {
    requireAuth.mockResolvedValue({ id: 'u2', email: 'jane@acme.io' })
    prisma.invitation.findUnique.mockResolvedValue(invite())
    prisma.orgMember.count.mockResolvedValue(0)
    const res = await post(acceptInvite, 'http://test/api/org/invites/accept', { token: 'a'.repeat(43) })
    expect(res.status).toBe(200)
    expect((await res.json()).orgId).toBe('org1')
    expect(prisma.orgMember.create).toHaveBeenCalledWith({ data: { orgId: 'org1', userId: 'u2', role: 'MEMBER' } })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { activeOrgId: 'org1' } })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('403s when the logged-in email does not match the invite', async () => {
    requireAuth.mockResolvedValue({ id: 'u3', email: 'intruder@evil.io' })
    prisma.invitation.findUnique.mockResolvedValue(invite())
    const res = await post(acceptInvite, 'http://test/api/org/invites/accept', { token: 'a'.repeat(43) })
    expect(res.status).toBe(403)
    expect(prisma.orgMember.create).not.toHaveBeenCalled()
  })

  it('410s on expired and on already-used invites', async () => {
    requireAuth.mockResolvedValue({ id: 'u2', email: 'jane@acme.io' })
    prisma.invitation.findUnique.mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }))
    expect((await post(acceptInvite, 'http://test/api/org/invites/accept', { token: 'a'.repeat(43) })).status).toBe(410)
    prisma.invitation.findUnique.mockResolvedValue(invite({ acceptedAt: new Date() }))
    expect((await post(acceptInvite, 'http://test/api/org/invites/accept', { token: 'a'.repeat(43) })).status).toBe(410)
  })

  it('409s when the org has no seats left at accept time', async () => {
    requireAuth.mockResolvedValue({ id: 'u2', email: 'jane@acme.io' })
    prisma.invitation.findUnique.mockResolvedValue(invite())
    prisma.orgMember.count.mockResolvedValue(2) // owner + 2 = Growth limit reached
    const res = await post(acceptInvite, 'http://test/api/org/invites/accept', { token: 'a'.repeat(43) })
    expect(res.status).toBe(409)
    expect(prisma.orgMember.create).not.toHaveBeenCalled()
  })
})

describe('/api/org/members', () => {
  it('GET lists the implicit owner first with seat usage', async () => {
    prisma.orgMember.findMany.mockResolvedValue([
      { role: 'MEMBER', createdAt: new Date(), user: { id: 'u2', email: 'jane@acme.io', name: 'Jane' } },
    ])
    prisma.orgMember.count.mockResolvedValue(1)
    const body = await (await getMembers(new Request('http://test/api/org/members'))).json()
    expect(body.members[0]).toMatchObject({ userId: 'owner1', role: 'OWNER' })
    expect(body.members[1]).toMatchObject({ userId: 'u2', role: 'MEMBER' })
    expect(body.seats).toMatchObject({ members: 2, limit: 3, plan: 'GROWTH' })
  })

  it('DELETE removes a member and clears their active-org pointer', async () => {
    prisma.orgMember.findUnique.mockResolvedValue({ id: 'm1' })
    const res = await removeMember(new Request('http://test/api/org/members?userId=u2', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(prisma.orgMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u2', activeOrgId: 'org1' },
      data: { activeOrgId: null },
    })
  })

  it('DELETE can never remove the org owner', async () => {
    const res = await removeMember(new Request('http://test/api/org/members?userId=owner1', { method: 'DELETE' }))
    expect(res.status).toBe(400)
    expect(prisma.orgMember.delete).not.toHaveBeenCalled()
  })

  it('DELETE is owner-only', async () => {
    requireAuth.mockResolvedValue({ id: 'u2', email: 'member@acme.io' })
    prisma.orgMember.findUnique.mockResolvedValue({ role: 'MEMBER' })
    const res = await removeMember(new Request('http://test/api/org/members?userId=u3', { method: 'DELETE' }))
    expect(res.status).toBe(403)
  })

  it('401s when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'))
    expect((await getMembers(new Request('http://test/api/org/members'))).status).toBe(401)
  })
})
