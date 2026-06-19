/**
 * Firm (fractional-CFO practice) helpers. Raw SQL so the new Firm/Organization.firmId
 * schema does not require a Prisma client regeneration.
 *
 * A user owns at most one firm (created lazily the first time they add a client).
 * The firm groups the CFO's client orgs for the roster, white-label branding, and
 * later firm-level billing.
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface Firm {
  id: string
  ownerUserId: string
  name: string
  brandLogoUrl: string | null
  brandColor: string | null
}

/** The firm this user owns, or null. */
export async function getFirmForOwner(userId: string): Promise<Firm | null> {
  const rows = await prisma.$queryRaw<Firm[]>(Prisma.sql`
    SELECT "id", "ownerUserId", "name", "brandLogoUrl", "brandColor"
    FROM "Firm" WHERE "ownerUserId" = ${userId} LIMIT 1
  `)
  return rows[0] ?? null
}

/** Get-or-create the user's firm. `name` seeds a new firm's display name. */
export async function getOrCreateFirm(userId: string, name: string): Promise<Firm> {
  const existing = await getFirmForOwner(userId)
  if (existing) return existing
  const id = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "Firm" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
    VALUES (${id}, ${userId}, ${name}, now(), now())
  `)
  return { id, ownerUserId: userId, name, brandLogoUrl: null, brandColor: null }
}

/** Update white-label branding for the user's firm. No-op if they have no firm. */
export async function updateFirmBranding(
  userId: string,
  patch: { name?: string; brandLogoUrl?: string | null; brandColor?: string | null },
): Promise<Firm | null> {
  const firm = await getFirmForOwner(userId)
  if (!firm) return null
  const name = patch.name ?? firm.name
  const logo = patch.brandLogoUrl === undefined ? firm.brandLogoUrl : patch.brandLogoUrl
  const color = patch.brandColor === undefined ? firm.brandColor : patch.brandColor
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Firm" SET "name" = ${name}, "brandLogoUrl" = ${logo}, "brandColor" = ${color}, "updatedAt" = now()
    WHERE "id" = ${firm.id}
  `)
  return { ...firm, name, brandLogoUrl: logo, brandColor: color }
}

export interface FirmClient {
  orgId: string
  orgName: string
  clientEmail: string | null
  connectedSources: number // count of CONNECTED financial integrations
  lastSyncedAt: Date | null
}

/**
 * The firm's client roster: every org linked to the firm, with the owner's email
 * and how many financial integrations are live (so the CFO sees who still needs
 * to connect their bank/Stripe).
 */
export async function listFirmClients(firmId: string): Promise<FirmClient[]> {
  return prisma.$queryRaw<FirmClient[]>(Prisma.sql`
    SELECT o."id" AS "orgId",
           o."name" AS "orgName",
           u."email" AS "clientEmail",
           COALESCE(i.cnt, 0)::int AS "connectedSources",
           i.last AS "lastSyncedAt"
    FROM "Organization" o
    LEFT JOIN "User" u ON u."id" = o."userId"
    LEFT JOIN (
      SELECT "orgId", COUNT(*) AS cnt, MAX("lastSyncedAt") AS last
      FROM "Integration" WHERE "status" = 'CONNECTED' GROUP BY "orgId"
    ) i ON i."orgId" = o."id"
    WHERE o."firmId" = ${firmId}
    ORDER BY o."name" ASC
  `)
}

/** Pending (unaccepted, unexpired) client invites for a firm. */
export async function listPendingClientInvites(
  firmId: string,
): Promise<Array<{ id: string; clientEmail: string; clientName: string | null; expiresAt: Date; createdAt: Date }>> {
  return prisma.$queryRaw(Prisma.sql`
    SELECT "id", "clientEmail", "clientName", "expiresAt", "createdAt"
    FROM "ClientInvite"
    WHERE "firmId" = ${firmId} AND "status" = 'pending' AND "expiresAt" > now()
    ORDER BY "createdAt" DESC
  `)
}
