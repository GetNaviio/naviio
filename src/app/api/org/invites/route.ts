/**
 * Team invites — owner only.
 *   POST — create (or regenerate) an invite; returns the link ONCE. Only the
 *          SHA-256 hash is stored, so the link can't be re-shown later —
 *          re-inviting the same email regenerates it (upsert on orgId+email).
 *   GET  — pending invites (no tokens — they're hashed).
 *
 * Seat enforcement lives here: members + live invites must stay within the
 * plan's seat count (Starter 1 / Growth 3 / Pro 10 / CFO unlimited).
 */
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { getOrgRole, seatUsage, hashInviteToken, INVITE_TTL_DAYS } from '@/lib/org'

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
})

export const POST = withOrg(async (request, { user, orgId }) => {
  const limited = await rateLimit(request, 'invite', { limit: 30, windowSeconds: 3600 })
  if (limited) return limited

  const role = await getOrgRole(orgId, user.id)
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can invite members' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'A valid email is required' }, { status: 400 })
  const email = parsed.data.email

  // Already on the team? (owner email or an existing member)
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, owner: { select: { email: true } } },
  })
  if (org.owner.email.toLowerCase() === email) {
    return Response.json({ error: 'That is the owner of this organization' }, { status: 409 })
  }
  const existingMember = await prisma.orgMember.findFirst({
    where: { orgId, user: { email } },
    select: { id: true },
  })
  if (existingMember) {
    return Response.json({ error: 'That person is already a member' }, { status: 409 })
  }

  // Seat check. A re-invite to the same email doesn't consume a new seat.
  const existingInvite = await prisma.invitation.findUnique({
    where: { orgId_email: { orgId, email } },
    select: { id: true },
  })
  const seats = await seatUsage(orgId)
  if (!existingInvite && seats.used >= seats.limit) {
    return Response.json(
      {
        error: `Your ${seats.plan === 'CFO' ? 'CFO' : seats.plan.charAt(0) + seats.plan.slice(1).toLowerCase()} plan includes ${seats.limit} seat${seats.limit === 1 ? '' : 's'} — upgrade to invite more teammates`,
        code: 'SEAT_LIMIT',
      },
      { status: 409 },
    )
  }

  const raw = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const invite = await prisma.invitation.upsert({
    where: { orgId_email: { orgId, email } },
    create: { orgId, email, role: 'MEMBER', tokenHash: hashInviteToken(raw), invitedById: user.id, expiresAt },
    update: { tokenHash: hashInviteToken(raw), invitedById: user.id, expiresAt, acceptedAt: null },
    select: { id: true, email: true, role: true, expiresAt: true },
  })

  // Link origin comes from the request — correct in dev (localhost) and prod.
  const inviteUrl = `${new URL(request.url).origin}/invite/${raw}`

  return Response.json({ ...invite, expiresAt: invite.expiresAt.toISOString(), inviteUrl, orgName: org.name }, { status: 201 })
})

export const GET = withOrg(async (_request, { user, orgId }) => {
  const role = await getOrgRole(orgId, user.id)
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can view invites' }, { status: 403 })

  const invites = await prisma.invitation.findMany({
    where: { orgId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  })
  const now = Date.now()
  return Response.json({
    invites: invites.map((i) => ({
      ...i,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      expired: i.expiresAt.getTime() < now,
    })),
  })
})
