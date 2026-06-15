/**
 * Public client-portal read. No auth — the 256-bit token IS the credential.
 * Every request re-checks revoke + expiry server-side (a link can't outlive
 * its revocation), looks up by token HASH only, and returns the live snapshot
 * scoped to what the share permits.
 *
 * Invalid/revoked/expired all return 404 with the same shape — no oracle that
 * distinguishes "wrong token" from "revoked token".
 */
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { hashPortalToken, parseScopes, buildPortalSnapshot } from '@/lib/portal'
import { brandingFrom } from '@/lib/branding'

const gone = () => Response.json({ error: 'This link is no longer available' }, { status: 404 })

export async function GET(request: Request) {
  const limited = await rateLimit(request, 'portal_view', { limit: 120, windowSeconds: 600 })
  if (limited) return limited

  const token = new URL(request.url).pathname.split('/').pop()
  if (!token || token.length > 128) return gone()

  const share = await prisma.portalShare.findUnique({
    where: { tokenHash: hashPortalToken(token) },
    select: {
      id: true, orgId: true, scopes: true, revokedAt: true, expiresAt: true,
      org: { select: { name: true, brandLogoUrl: true, brandColor: true, hideNaviioBranding: true } },
    },
  })
  if (!share || share.revokedAt) return gone()
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return gone()

  const snapshot = await buildPortalSnapshot(
    share.orgId, share.org.name, parseScopes(share.scopes), brandingFrom(share.org),
  )

  // Best-effort view telemetry — never block the response on it.
  prisma.portalShare
    .update({ where: { id: share.id }, data: { lastViewedAt: new Date(), viewCount: { increment: 1 } } })
    .catch(() => {})

  return Response.json(snapshot, {
    // The secret token is in the URL, so this response must never sit in a shared
    // CDN/proxy cache (one client's financials served to another) — keep it private
    // and uncacheable. Never indexable.
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
}
