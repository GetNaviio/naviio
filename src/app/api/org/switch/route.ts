/**
 * Org switching for users who belong to more than one organization.
 *   GET  — list the user's organizations (owned + joined) with the active flag
 *   POST — set the active org (validated membership; everything downstream
 *          resolves through getDefaultOrgId, so the switch is global)
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isOrgMember } from '@/lib/org'
import { getRole, logAccess } from '@/lib/firm/access'
import { isFirmUser } from '@/lib/firm/firm'

export const GET = withAuth(async (_request, { user }) => {
  const [activeOrgId, owned, joined] = await Promise.all([
    getDefaultOrgId(user.id),
    prisma.organization.findMany({ where: { userId: user.id }, select: { id: true, name: true, plan: true } }),
    prisma.orgMember.findMany({
      where: { userId: user.id },
      select: { role: true, org: { select: { id: true, name: true } } },
    }),
  ])
  const orgs = [
    ...owned.map((o) => ({ id: o.id, name: o.name, role: 'OWNER' as const })),
    ...joined.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role })),
  ].map((o) => ({ ...o, active: o.id === activeOrgId }))
  // Multi-entity is a Pro+ capability: owning a Pro or CFO org unlocks creating
  // additional entities (same rule /api/org/create enforces).
  const canCreate = owned.some((o) => o.plan === 'PRO' || o.plan === 'CFO')
  // Surface the fractional-CFO/firm UI (Clients tab) only for firm-context users.
  const isFirm = await isFirmUser(user.id)
  return Response.json({ orgs, canCreate, isFirm })
})

const SwitchSchema = z.object({ orgId: z.string().min(1).max(64) })

export const POST = withAuth(async (request, { user }) => {
  const body = await request.json().catch(() => null)
  const parsed = SwitchSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'orgId is required' }, { status: 400 })

  if (!(await isOrgMember(parsed.data.orgId, user.id))) {
    return Response.json({ error: 'You are not a member of that organization' }, { status: 403 })
  }
  await prisma.user.update({ where: { id: user.id }, data: { activeOrgId: parsed.data.orgId } })
  // Audit advisors opening a client workspace (transparency trail).
  if ((await getRole(parsed.data.orgId, user.id)) === 'ADVISOR') {
    await logAccess(parsed.data.orgId, user.id, 'switch', 'advisor opened client workspace')
  }
  return Response.json({ ok: true })
})
