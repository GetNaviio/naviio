/**
 * Client-invite lifecycle for the fractional-CFO product (client-led model).
 *
 * Flow: a CFO "adds a client" → we create a ClientInvite and a one-time link.
 * The client opens it, signs up / logs in with THEIR OWN account, and accepts.
 * On accept we (1) ensure the client owns their org, (2) add the inviting advisor
 * as an ADVISOR member, (3) link the org to the firm, and (4) record the client's
 * explicit consent (acceptedAt + scopes). The client always owns their login and
 * data; the advisor only ever holds an ADVISOR membership the client can revoke.
 *
 * Tokens are stored as SHA-256 hashes; the raw link is returned once at creation.
 * Raw SQL throughout so the new tables need no Prisma client regeneration.
 */
import { randomBytes, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashInviteToken } from '@/lib/org'
import { logAccess } from '@/lib/firm/access'

export const CLIENT_INVITE_TTL_DAYS = 14

export interface CreateClientInviteInput {
  firmId: string
  advisorUserId: string
  clientEmail: string
  clientName?: string | null
  consentScopes?: string
}

/** Create (or refresh) a pending client invite. Returns the raw one-time token. */
export async function createClientInvite(
  input: CreateClientInviteInput,
): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  const email = input.clientEmail.trim().toLowerCase()
  const raw = randomBytes(32).toString('base64url')
  const tokenHash = hashInviteToken(raw)
  const expiresAt = new Date(Date.now() + CLIENT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  // One live invite per (firm, email): refresh an existing pending one in place.
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ClientInvite"
    WHERE "firmId" = ${input.firmId} AND "clientEmail" = ${email} AND "status" = 'pending'
    LIMIT 1
  `)
  if (existing[0]) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ClientInvite"
      SET "tokenHash" = ${tokenHash}, "clientName" = ${input.clientName ?? null},
          "consentScopes" = ${input.consentScopes ?? 'financials'},
          "advisorUserId" = ${input.advisorUserId}, "expiresAt" = ${expiresAt}, "acceptedAt" = NULL
      WHERE "id" = ${existing[0].id}
    `)
    return { id: existing[0].id, rawToken: raw, expiresAt }
  }

  const id = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ClientInvite"
      ("id", "firmId", "advisorUserId", "clientEmail", "clientName", "tokenHash", "status", "consentScopes", "expiresAt", "createdAt")
    VALUES
      (${id}, ${input.firmId}, ${input.advisorUserId}, ${email}, ${input.clientName ?? null}, ${tokenHash}, 'pending', ${input.consentScopes ?? 'financials'}, ${expiresAt}, now())
  `)
  return { id, rawToken: raw, expiresAt }
}

export interface ClientInvitePreview {
  status: 'valid' | 'expired' | 'accepted' | 'invalid'
  clientEmail?: string
  firmName?: string
  consentScopes?: string
}

/** Public preview of an invite link (no token echoed back). */
export async function previewClientInvite(rawToken: string): Promise<ClientInvitePreview> {
  const tokenHash = hashInviteToken(rawToken)
  const rows = await prisma.$queryRaw<
    Array<{ status: string; clientEmail: string; consentScopes: string; expiresAt: Date; firmName: string }>
  >(Prisma.sql`
    SELECT ci."status", ci."clientEmail", ci."consentScopes", ci."expiresAt", f."name" AS "firmName"
    FROM "ClientInvite" ci JOIN "Firm" f ON f."id" = ci."firmId"
    WHERE ci."tokenHash" = ${tokenHash} LIMIT 1
  `)
  const inv = rows[0]
  if (!inv) return { status: 'invalid' }
  if (inv.status === 'accepted') return { status: 'accepted' }
  if (inv.status !== 'pending' || inv.expiresAt.getTime() < Date.now()) return { status: 'expired' }
  return {
    status: 'valid',
    clientEmail: inv.clientEmail,
    firmName: inv.firmName,
    consentScopes: inv.consentScopes,
  }
}

/** Ensure `userId` owns an org; return its id (creating one if needed). */
async function ensureOwnedOrg(userId: string, fallbackName: string): Promise<string> {
  const owned = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "Organization" WHERE "userId" = ${userId} ORDER BY "createdAt" ASC LIMIT 1`,
  )
  if (owned[0]) return owned[0].id
  const id = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "Organization" ("id", "name", "userId", "plan", "createdAt", "updatedAt")
    VALUES (${id}, ${fallbackName}, ${userId}, 'STARTER', now(), now())
  `)
  return id
}

export interface AcceptResult {
  ok: boolean
  orgId?: string
  error?: string
}

/**
 * Accept a client invite as the logged-in client. Email must match the invite.
 * Idempotent-ish: a second accept with the same token is a no-op success.
 */
export async function acceptClientInvite(
  rawToken: string,
  user: { id: string; email: string; name?: string | null },
): Promise<AcceptResult> {
  const tokenHash = hashInviteToken(rawToken)
  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      firmId: string
      advisorUserId: string
      clientEmail: string
      clientName: string | null
      status: string
      consentScopes: string
      expiresAt: Date
      orgId: string | null
    }>
  >(Prisma.sql`
    SELECT "id", "firmId", "advisorUserId", "clientEmail", "clientName", "status", "consentScopes", "expiresAt", "orgId"
    FROM "ClientInvite" WHERE "tokenHash" = ${tokenHash} LIMIT 1
  `)
  const inv = rows[0]
  if (!inv) return { ok: false, error: 'This invite link is invalid.' }
  if (inv.status === 'accepted') return { ok: true, orgId: inv.orgId ?? undefined }
  if (inv.status !== 'pending' || inv.expiresAt.getTime() < Date.now())
    return { ok: false, error: 'This invite has expired. Ask your CFO to resend it.' }
  if (inv.clientEmail !== user.email.trim().toLowerCase())
    return { ok: false, error: `This invite was issued to ${inv.clientEmail}. Log in with that email to accept.` }

  const orgId = await ensureOwnedOrg(user.id, inv.clientName || user.name || user.email)

  // Add the advisor as an ADVISOR member (idempotent), link the org to the firm,
  // and mark the invite accepted — all atomically.
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OrgMember" ("id", "orgId", "userId", "role", "createdAt")
      VALUES (${randomUUID()}, ${orgId}, ${inv.advisorUserId}, 'ADVISOR', now())
      ON CONFLICT ("orgId", "userId") DO UPDATE SET "role" = 'ADVISOR'
    `),
    prisma.$executeRaw(Prisma.sql`UPDATE "Organization" SET "firmId" = ${inv.firmId} WHERE "id" = ${orgId}`),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "ClientInvite" SET "status" = 'accepted', "acceptedAt" = now(), "orgId" = ${orgId} WHERE "id" = ${inv.id}
    `),
  ])

  await logAccess(
    orgId,
    user.id,
    'consent_granted',
    `client granted ${inv.consentScopes} access to advisor ${inv.advisorUserId}`,
  )
  return { ok: true, orgId }
}

/** Revoke an advisor's access to a client org (client-initiated). */
export async function revokeAdvisor(orgId: string, advisorUserId: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "OrgMember" WHERE "orgId" = ${orgId} AND "userId" = ${advisorUserId} AND "role" = 'ADVISOR'`,
  )
}
