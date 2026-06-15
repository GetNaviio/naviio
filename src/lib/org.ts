/**
 * Team / multi-user helpers: roles, seat limits, membership resolution.
 *
 * Model: the org creator (Organization.userId) is the implicit OWNER and has
 * no OrgMember row. Invited users get OrgMember rows. This keeps every
 * existing single-user org valid with zero backfill.
 *
 * Seats are sold per plan on the pricing page; this is where that promise is
 * enforced. Pending (unexpired, unaccepted) invites count toward the limit so
 * an owner can't oversell their own org.
 */
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Plan, OrgRole } from '@prisma/client'

/** Invite tokens are stored hashed — the raw link is shown once at creation. */
export const hashInviteToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

/** Seats per plan — must match the pricing page (Starter 1 / Growth 3 / Pro 10 / CFO unlimited). */
export const SEAT_LIMITS: Record<Plan, number> = {
  STARTER: 1,
  GROWTH: 3,
  PRO: 10,
  CFO: Number.POSITIVE_INFINITY,
}

export const INVITE_TTL_DAYS = 14

/**
 * Display label for a plan. "CFO" stays an acronym; the rest are title-cased
 * (STARTER → Starter). Single source of truth so the UI never re-implements it.
 */
export function planLabel(plan: Plan | string): string {
  return plan === 'CFO' ? 'CFO' : plan.charAt(0) + plan.slice(1).toLowerCase()
}

/** The caller's role in an org, or null if they don't belong to it. */
export async function getOrgRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { userId: true } })
  if (!org) return null
  if (org.userId === userId) return 'OWNER'
  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  })
  return member?.role ?? null
}

/** True if the user owns or belongs to the org — used to validate activeOrgId. */
export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  return (await getOrgRole(orgId, userId)) !== null
}

export interface SeatUsage {
  used: number // owner + members + live invites
  members: number // owner + members (actual humans with access)
  pendingInvites: number
  limit: number // Infinity for CFO
  plan: Plan
}

export async function seatUsage(orgId: string): Promise<SeatUsage> {
  const [org, members, pendingInvites] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } }),
    prisma.orgMember.count({ where: { orgId } }),
    prisma.invitation.count({
      where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ])
  const humans = 1 + members // implicit owner + member rows
  return {
    used: humans + pendingInvites,
    members: humans,
    pendingInvites,
    limit: SEAT_LIMITS[org.plan],
    plan: org.plan,
  }
}
