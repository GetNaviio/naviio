/**
 * The active organization itself.
 *   PATCH — rename (owner only). Client entities need real names on reports.
 */
import { z } from 'zod'
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { getOrgRole } from '@/lib/org'

const RenameSchema = z.object({ name: z.string().trim().min(2).max(80) })

export const PATCH = withOrg(async (request, { user, orgId }) => {
  const role = await getOrgRole(orgId, user.id)
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can rename the organization' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const parsed = RenameSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Organization name must be 2–80 characters' }, { status: 400 })
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  })
  return Response.json({ ok: true, name: org.name })
})
