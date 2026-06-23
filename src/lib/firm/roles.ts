/**
 * Firm-level RBAC (Partner / Analyst). This sits ABOVE the per-org roles in
 * lib/firm/access.ts:
 *   - Org roles (OWNER / MEMBER / ADVISOR) gate access to a single organization.
 *   - Firm roles (PARTNER / ANALYST) gate firm-wide admin — billing, branding,
 *     Stripe Connect, the client book, and managing the team.
 *
 * The Firm.ownerUserId is implicitly a PARTNER (no FirmMember row). Additional
 * team members have a FirmMember row carrying their tier.
 *
 * Raw SQL so this does not depend on regenerating the Prisma client for the new
 * FirmRole enum / FirmMember model.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type FirmRole = 'PARTNER' | 'ANALYST'

export type FirmPermission =
  | 'manage_billing' // firm plan, payment, Stripe Connect
  | 'manage_branding' // firm white-label
  | 'manage_connect' // Stripe Connect onboarding
  | 'manage_clients' // add / remove client orgs from the firm
  | 'manage_team' // invite / remove firm members, set their tier
  | 'access_clients' // open and work in client orgs

const FIRM_PERMISSIONS: Record<FirmRole, FirmPermission[]> = {
  PARTNER: ['manage_billing', 'manage_branding', 'manage_connect', 'manage_clients', 'manage_team', 'access_clients'],
  // Analysts do the client work but never touch firm admin / billing.
  ANALYST: ['access_clients'],
}

/** Can a firm role perform a firm-level action? Unknown roles get nothing. */
export function firmCan(role: FirmRole | null, action: FirmPermission): boolean {
  if (!role) return false
  return FIRM_PERMISSIONS[role].includes(action)
}

/**
 * The user's firm tier: PARTNER if they own a firm, else their FirmMember tier,
 * else null (not part of a firm).
 */
export async function getFirmRole(userId: string): Promise<FirmRole | null> {
  const owns = await prisma.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
    SELECT EXISTS (SELECT 1 FROM "Firm" WHERE "ownerUserId" = ${userId}) AS ok
  `)
  if (owns[0]?.ok) return 'PARTNER'
  // FirmMember may not be migrated yet — degrade to "not a member" rather than 500.
  const rows = await prisma.$queryRaw<Array<{ role: string }>>(Prisma.sql`
    SELECT "role"::text AS role FROM "FirmMember" WHERE "userId" = ${userId} LIMIT 1
  `).catch(() => [] as Array<{ role: string }>)
  return (rows[0]?.role as FirmRole) ?? null
}

/** The firm the user belongs to (owned first, else membership), or null. */
export async function getFirmIdForUser(userId: string): Promise<string | null> {
  const owned = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Firm" WHERE "ownerUserId" = ${userId} LIMIT 1
  `)
  if (owned[0]?.id) return owned[0].id
  // FirmMember may not be migrated yet on every DB — degrade to "owned only"
  // rather than 500 the whole firm/advisor surface.
  const member = await prisma.$queryRaw<Array<{ firmId: string }>>(Prisma.sql`
    SELECT "firmId" FROM "FirmMember" WHERE "userId" = ${userId} LIMIT 1
  `).catch(() => [] as Array<{ firmId: string }>)
  return member[0]?.firmId ?? null
}

/** Throw-free permission gate for firm routes. */
export async function firmUserCan(userId: string, action: FirmPermission): Promise<boolean> {
  return firmCan(await getFirmRole(userId), action)
}
