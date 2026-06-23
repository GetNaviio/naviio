/**
 * Firm team management (Partner only). Partners add/remove team members and set
 * their tier (PARTNER / ANALYST). Analysts do client work but not firm admin.
 *
 * The firm owner is the founding Partner and is always shown but never removable
 * here. Members must already have a Naviio account (added by email).
 *
 * Raw SQL for FirmMember so this doesn't depend on regenerating the Prisma
 * client for the new model/enum.
 */
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getFirmRole, getFirmIdForUser, firmCan } from '@/lib/firm/roles'

interface TeamRow {
  userId: string
  email: string
  name: string | null
  role: string
  isOwner: boolean
}

export const GET = withAuth(async (_request, { user }) => {
  const firmId = await getFirmIdForUser(user.id)
  if (!firmId) return Response.json({ members: [], role: null })

  const role = await getFirmRole(user.id)
  const rows = await prisma.$queryRaw<TeamRow[]>(Prisma.sql`
    SELECT u."id" AS "userId", u."email", u."name", 'PARTNER' AS role, true AS "isOwner"
    FROM "Firm" f JOIN "User" u ON u."id" = f."ownerUserId"
    WHERE f."id" = ${firmId}
    UNION ALL
    SELECT u."id" AS "userId", u."email", u."name", m."role"::text AS role, false AS "isOwner"
    FROM "FirmMember" m JOIN "User" u ON u."id" = m."userId"
    WHERE m."firmId" = ${firmId}
    ORDER BY "isOwner" DESC, "email" ASC
  `).catch(() =>
    // FirmMember not migrated yet — show just the owner rather than 500.
    prisma.$queryRaw<TeamRow[]>(Prisma.sql`
      SELECT u."id" AS "userId", u."email", u."name", 'PARTNER' AS role, true AS "isOwner"
      FROM "Firm" f JOIN "User" u ON u."id" = f."ownerUserId"
      WHERE f."id" = ${firmId}
    `).catch(() => [] as TeamRow[]),
  )
  return Response.json({ members: rows, role })
})

const AddSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['PARTNER', 'ANALYST']).default('ANALYST'),
})

export const POST = withAuth(async (request, { user }) => {
  if (!firmCan(await getFirmRole(user.id), 'manage_team')) {
    return Response.json({ error: 'Only a firm Partner can manage the team', code: 'PARTNER_REQUIRED' }, { status: 403 })
  }
  const firmId = await getFirmIdForUser(user.id)
  if (!firmId) return Response.json({ error: 'No firm yet — add your first client to create one.' }, { status: 404 })

  const parsed = AddSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Provide a valid email and role' }, { status: 400 })
  const { email, role } = parsed.data

  const target = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
  if (!target) {
    return Response.json(
      { error: 'No Naviio account with that email. Ask them to sign up first, then add them.' },
      { status: 404 },
    )
  }
  // The owner is already a Partner; don't create a redundant row.
  const owner = await prisma.$queryRaw<Array<{ ok: boolean }>>(
    Prisma.sql`SELECT EXISTS (SELECT 1 FROM "Firm" WHERE "id" = ${firmId} AND "ownerUserId" = ${target.id}) AS ok`,
  )
  if (owner[0]?.ok) return Response.json({ error: 'That user already owns this firm.' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "FirmMember" ("id", "firmId", "userId", "role", "createdAt")
    VALUES (${randomUUID()}, ${firmId}, ${target.id}, ${role}::"FirmRole", now())
    ON CONFLICT ("firmId", "userId") DO UPDATE SET "role" = ${role}::"FirmRole"
  `)
  return Response.json({ ok: true })
})

export const DELETE = withAuth(async (request, { user }) => {
  if (!firmCan(await getFirmRole(user.id), 'manage_team')) {
    return Response.json({ error: 'Only a firm Partner can manage the team', code: 'PARTNER_REQUIRED' }, { status: 403 })
  }
  const firmId = await getFirmIdForUser(user.id)
  if (!firmId) return Response.json({ error: 'No firm' }, { status: 404 })

  const targetId = new URL(request.url).searchParams.get('userId')?.trim()
  if (!targetId) return Response.json({ error: 'userId is required' }, { status: 400 })

  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "FirmMember" WHERE "firmId" = ${firmId} AND "userId" = ${targetId}`,
  )
  return Response.json({ ok: true })
})
