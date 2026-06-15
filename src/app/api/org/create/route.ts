/**
 * Multi-entity (CFO Suite): create an additional organization — a separate
 * set of books for a client. Gated to users who OWN at least one CFO-plan
 * org (the fractional CFO's subscription umbrella). Created entities are
 * plan CFO themselves: covered by that subscription, unlimited seats.
 *
 * withAuth, not withOrg — creation is an account-level act, and the new org
 * becomes the active one immediately (the dashboard then opens onboarding
 * for it: connect the client's bank).
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'

const CreateSchema = z.object({ name: z.string().trim().min(2).max(80) })

export const POST = withAuth(async (request, { user }) => {
  const limited = await rateLimit(request, 'org_create', { limit: 10, windowSeconds: 3600 })
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Organization name must be 2–80 characters' }, { status: 400 })
  }

  const cfoOrgs = await prisma.organization.count({ where: { userId: user.id, plan: 'CFO' } })
  if (cfoOrgs === 0) {
    return Response.json(
      { error: 'Managing multiple organizations is a CFO Suite feature — upgrade to add client entities', code: 'CFO_REQUIRED' },
      { status: 403 },
    )
  }

  const org = await prisma.organization.create({
    data: { name: parsed.data.name, userId: user.id, plan: 'CFO' },
    select: { id: true, name: true },
  })
  // Land in the new entity — its dashboard opens the connect-your-bank flow.
  await prisma.user.update({ where: { id: user.id }, data: { activeOrgId: org.id } })

  return Response.json({ ok: true, orgId: org.id, name: org.name }, { status: 201 })
})
