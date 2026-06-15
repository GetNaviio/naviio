/**
 * Accept an invite. Uses withAuth (NOT withOrg) deliberately: withOrg would
 * auto-create a personal org for a brand-new user before they join the team —
 * exactly the phantom org this flow exists to avoid.
 *
 * Security: the logged-in user's email must match the invite's email. The
 * link alone is never sufficient to join someone else's books.
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { hashInviteToken, SEAT_LIMITS } from '@/lib/org'

const AcceptSchema = z.object({ token: z.string().min(16).max(128) })

export const POST = withAuth(async (request, { user }) => {
  const limited = await rateLimit(request, 'invite_accept', { limit: 20, windowSeconds: 600 })
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const parsed = AcceptSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid invite token' }, { status: 400 })

  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(parsed.data.token) },
    select: {
      id: true, orgId: true, email: true, role: true, expiresAt: true, acceptedAt: true,
      org: { select: { name: true, userId: true, plan: true } },
    },
  })
  if (!invite) return Response.json({ error: 'This invite link is not valid' }, { status: 404 })
  if (invite.acceptedAt) return Response.json({ error: 'This invite has already been used' }, { status: 410 })
  if (invite.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: 'This invite has expired — ask for a new one' }, { status: 410 })
  }
  if (invite.email !== user.email.toLowerCase()) {
    return Response.json(
      { error: `This invite was issued to ${invite.email}. Log in with that email to accept it.` },
      { status: 403 },
    )
  }

  // Owner clicking their own org's invite, or an existing member re-clicking:
  // just point them at the org — no duplicate membership.
  const alreadyMember =
    invite.org.userId === user.id ||
    (await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
      select: { id: true },
    })) !== null
  if (alreadyMember) {
    await prisma.$transaction([
      prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { activeOrgId: invite.orgId } }),
    ])
    return Response.json({ ok: true, orgId: invite.orgId, orgName: invite.org.name })
  }

  // Seat re-check at accept time (the plan may have changed since the invite).
  const memberCount = await prisma.orgMember.count({ where: { orgId: invite.orgId } })
  if (1 + memberCount >= SEAT_LIMITS[invite.org.plan]) {
    return Response.json(
      { error: 'This organization has no seats left — ask the owner to upgrade their plan' },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.orgMember.create({ data: { orgId: invite.orgId, userId: user.id, role: invite.role } }),
    prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    // Make the joined org their working org immediately.
    prisma.user.update({ where: { id: user.id }, data: { activeOrgId: invite.orgId } }),
  ])

  return Response.json({ ok: true, orgId: invite.orgId, orgName: invite.org.name })
})
