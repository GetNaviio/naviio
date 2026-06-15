/** Revoke a pending invite — owner only. */
import { withOwner } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'

export const DELETE = withOwner(async (request, { orgId }) => {
  const id = new URL(request.url).pathname.split('/').pop()
  if (!id) return Response.json({ error: 'Invite id required' }, { status: 400 })

  // Org-scoped delete — a foreign id is a no-op 404, never cross-org.
  const { count } = await prisma.invitation.deleteMany({ where: { id, orgId, acceptedAt: null } })
  if (count === 0) return Response.json({ error: 'Invite not found' }, { status: 404 })
  return Response.json({ ok: true })
})
