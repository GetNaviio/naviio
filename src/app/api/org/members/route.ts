/**
 * Team roster.
 *   GET    — members + seat usage (any member of the org)
 *   DELETE — remove a member (owner only; the owner can never be removed)
 */
import { withOrg, withOwner } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { getOrgRole, seatUsage } from '@/lib/org'

export const GET = withOrg(async (_request, { user, orgId }) => {
  const role = await getOrgRole(orgId, user.id)
  if (!role) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const [org, memberRows, seats] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, owner: { select: { id: true, email: true, name: true } } },
    }),
    prisma.orgMember.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
    }),
    seatUsage(orgId),
  ])

  return Response.json({
    orgName: org.name,
    yourRole: role,
    members: [
      { userId: org.owner.id, email: org.owner.email, name: org.owner.name, role: 'OWNER', joinedAt: null },
      ...memberRows.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    ],
    seats: {
      used: seats.used,
      members: seats.members,
      pendingInvites: seats.pendingInvites,
      limit: Number.isFinite(seats.limit) ? seats.limit : null, // null = unlimited
      plan: seats.plan,
    },
  })
})

export const DELETE = withOwner(async (request, { orgId }) => {
  const targetId = new URL(request.url).searchParams.get('userId')
  if (!targetId) return Response.json({ error: 'userId is required' }, { status: 400 })

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { userId: true } })
  if (targetId === org.userId) {
    return Response.json({ error: 'The organization owner cannot be removed' }, { status: 400 })
  }

  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: targetId } },
    select: { id: true },
  })
  if (!membership) return Response.json({ error: 'Not a member of this organization' }, { status: 404 })

  await prisma.$transaction([
    prisma.orgMember.delete({ where: { id: membership.id } }),
    // Their active-org pointer must not keep them inside an org they left;
    // updateMany (not update) so a concurrent change can't throw.
    prisma.user.updateMany({ where: { id: targetId, activeOrgId: orgId }, data: { activeOrgId: null } }),
  ])

  return Response.json({ ok: true })
})
