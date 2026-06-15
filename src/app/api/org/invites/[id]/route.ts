/** Revoke a pending invite — owner only. */
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { getOrgRole } from '@/lib/org'

export const DELETE = withOrg(async (request, { user, orgId }) => {
  const role = await getOrgRole(orgId, user.id)
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can revoke invites' }, { status: 403 })

  const id = new URL(request.url).pathname.split('/').pop()
  if (!id) return Response.json({ error: 'Invite id required' }, { status: 400 })

  // Org-scoped delete — a foreign id is a no-op 404, never cross-org.
  const { count } = await prisma.invitation.deleteMany({ where: { id, orgId, acceptedAt: null } })
  if (count === 0) return Response.json({ error: 'Invite not found' }, { status: 404 })
  return Response.json({ ok: true })
})
