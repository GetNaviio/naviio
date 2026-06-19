/**
 * Advisor access model + audit logging for the fractional-CFO product.
 *
 * Roles (OrgRole): OWNER (the client/business), MEMBER (their teammate), and
 * ADVISOR (a fractional CFO / CPA invited onto the client's org). Access control
 * still lives in OrgMember rows — the Firm grouping is organizational only.
 *
 * Permission philosophy: an advisor should be able to do the analytical work
 * (read everything, categorize/reclassify, export board packs) but NEVER touch
 * the client's control plane — connecting/disconnecting bank/Stripe, billing,
 * managing members, or deleting the org. Those stay owner-only.
 *
 * Roles are read via raw SQL (returning a plain string) so this module does not
 * depend on regenerating the Prisma client for the new ADVISOR enum value.
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type Role = 'OWNER' | 'MEMBER' | 'ADVISOR'

export type Permission =
  | 'view' // read dashboards, reports, transactions
  | 'categorize' // reclassify transactions, set overrides
  | 'export' // board packs, report exports
  | 'manage_integrations' // connect/disconnect bank, Stripe, accounting
  | 'manage_documents' // connect/disconnect Dropbox, share/unshare files
  | 'manage_members' // invite/remove members, change roles
  | 'manage_billing' // plan, credits, payment method
  | 'delete_org' // delete the organization

const PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'view',
    'categorize',
    'export',
    'manage_integrations',
    'manage_documents',
    'manage_members',
    'manage_billing',
    'delete_org',
  ],
  // A client's own teammate: full analytical use, but control-plane stays owner-only.
  MEMBER: ['view', 'categorize', 'export', 'manage_documents'],
  // A fractional CFO / CPA: analytical work + can share docs, never the control plane.
  ADVISOR: ['view', 'categorize', 'export', 'manage_documents'],
}

/** Can a role perform an action? Unknown roles get nothing. */
export function can(role: Role | string | null, action: Permission): boolean {
  if (!role) return false
  const list = PERMISSIONS[role as Role]
  return !!list && list.includes(action)
}

/** True for fractional-CFO/advisor seats (drives advisor-specific UI/audit). */
export const isAdvisor = (role: Role | string | null): boolean => role === 'ADVISOR'

/**
 * The caller's role in an org as a plain string ('OWNER' | 'MEMBER' | 'ADVISOR'),
 * or null if they don't belong. Uses raw SQL so the ADVISOR value doesn't depend
 * on the generated Prisma enum.
 */
export async function getRole(orgId: string, userId: string): Promise<Role | null> {
  const owner = await prisma.$queryRaw<Array<{ userId: string }>>(
    Prisma.sql`SELECT "userId" FROM "Organization" WHERE "id" = ${orgId} LIMIT 1`,
  )
  if (owner.length === 0) return null
  if (owner[0].userId === userId) return 'OWNER'
  const member = await prisma.$queryRaw<Array<{ role: string }>>(
    Prisma.sql`SELECT "role"::text AS role FROM "OrgMember" WHERE "orgId" = ${orgId} AND "userId" = ${userId} LIMIT 1`,
  )
  return (member[0]?.role as Role) ?? null
}

/** Append-only access audit. Best-effort: never throws into the request path. */
export async function logAccess(
  orgId: string,
  actorUserId: string,
  action: string,
  detail?: string,
): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AccessLog" ("id", "orgId", "actorUserId", "action", "detail", "createdAt")
      VALUES (${randomUUID()}, ${orgId}, ${actorUserId}, ${action}, ${detail ?? null}, now())
    `)
  } catch (e) {
    console.error('access log write failed:', e)
  }
}

/** Recent access entries for an org (for the client's transparency view). */
export async function recentAccess(
  orgId: string,
  limit = 50,
): Promise<Array<{ actorUserId: string; action: string; detail: string | null; createdAt: Date }>> {
  return prisma.$queryRaw(Prisma.sql`
    SELECT "actorUserId", "action", "detail", "createdAt"
    FROM "AccessLog" WHERE "orgId" = ${orgId}
    ORDER BY "createdAt" DESC LIMIT ${limit}
  `)
}
