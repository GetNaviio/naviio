/**
 * Client-side control over who has advisor access to THIS org.
 *   GET    — list advisors on the active org (+ the managing firm, if any)
 *   DELETE — owner revokes an advisor's access (the "revoke anytime" promise)
 */
import { z } from 'zod'
import { withOrg, withOwner } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { revokeAdvisor } from '@/lib/firm/clients'
import { logAccess } from '@/lib/firm/access'

export const GET = withOrg(async (_request, { orgId }) => {
  const advisors = await prisma.$queryRaw<Array<{ userId: string; email: string; name: string | null; since: Date }>>(
    Prisma.sql`
      SELECT m."userId", u."email", u."name", m."createdAt" AS "since"
      FROM "OrgMember" m JOIN "User" u ON u."id" = m."userId"
      WHERE m."orgId" = ${orgId} AND m."role"::text = 'ADVISOR'
      ORDER BY m."createdAt" ASC
    `,
  )
  const firm = await prisma.$queryRaw<Array<{ name: string; brandColor: string | null }>>(Prisma.sql`
    SELECT f."name", f."brandColor" FROM "Organization" o JOIN "Firm" f ON f."id" = o."firmId"
    WHERE o."id" = ${orgId} LIMIT 1
  `)
  return Response.json({ advisors, firm: firm[0] ?? null })
})

const RevokeSchema = z.object({ userId: z.string().min(1).max(64) })

export const DELETE = withOwner(async (request, { user, orgId }) => {
  const body = await request.json().catch(() => null)
  const parsed = RevokeSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'userId is required' }, { status: 400 })

  await revokeAdvisor(orgId, parsed.data.userId)
  await logAccess(orgId, user.id, 'advisor_revoked', `owner revoked advisor ${parsed.data.userId}`)
  return Response.json({ ok: true })
})
