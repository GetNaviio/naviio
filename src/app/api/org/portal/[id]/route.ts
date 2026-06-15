/** Portal share by id — owner only.
 *   POST   — regenerate the link (mint a fresh token; the old URL stops working).
 *            Tokens are stored hashed and can't be shown again, so this is how an
 *            owner who lost the one-time link gets a copyable one without losing
 *            the share's settings and view history.
 *   DELETE — revoke. Instant: the next view re-checks revokedAt server-side. */
import { randomBytes } from 'crypto'
import { withOwner } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/portal'

export const POST = withOwner(async (request, { orgId }) => {
  const id = new URL(request.url).pathname.split('/').pop()
  if (!id) return Response.json({ error: 'Share id required' }, { status: 400 })

  const raw = randomBytes(32).toString('base64url')
  // Org-scoped: replace the token (invalidating the old URL) and clear any prior
  // revoke so the fresh link is active. Label, scopes, expiry and history persist.
  const { count } = await prisma.portalShare.updateMany({
    where: { id, orgId },
    data: { tokenHash: hashPortalToken(raw), revokedAt: null },
  })
  if (count === 0) return Response.json({ error: 'Share not found' }, { status: 404 })

  const share = await prisma.portalShare.findFirst({ where: { id, orgId }, select: { label: true } })
  const portalUrl = `${new URL(request.url).origin}/portal/${raw}`
  return Response.json({ ok: true, label: share?.label ?? '', portalUrl })
})

export const DELETE = withOwner(async (request, { orgId }) => {
  const id = new URL(request.url).pathname.split('/').pop()
  if (!id) return Response.json({ error: 'Share id required' }, { status: 400 })

  // Org-scoped, and we soft-revoke (keep the row for its view-count history).
  const { count } = await prisma.portalShare.updateMany({
    where: { id, orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count === 0) return Response.json({ error: 'Share not found' }, { status: 404 })
  return Response.json({ ok: true })
})
