/**
 * Client portal shares — owner only.
 *   GET  — list this org's shares (no tokens; they're hashed).
 *   POST — create a share; returns the link ONCE (only the hash is stored).
 *
 * CFO Suite framing, but the gate is org ownership: anyone who owns the active
 * org can share its books read-only. The link itself carries no credentials
 * beyond a 256-bit token, and every view re-checks revoke/expiry server-side.
 */
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/org'
import { hashPortalToken, ALL_SCOPES } from '@/lib/portal'

const CreateSchema = z.object({
  label: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(['pnl', 'cash', 'kpis'])).min(1).default([...ALL_SCOPES]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

export const GET = withOrg(async (_request, { user, orgId }) => {
  if ((await getOrgRole(orgId, user.id)) !== 'OWNER') {
    return Response.json({ error: 'Only the owner can manage portal links' }, { status: 403 })
  }
  const shares = await prisma.portalShare.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, label: true, scopes: true, expiresAt: true, revokedAt: true,
      lastViewedAt: true, viewCount: true, createdAt: true,
    },
  })
  const now = Date.now()
  return Response.json({
    shares: shares.map((s) => ({
      ...s,
      scopes: s.scopes.split(','),
      expiresAt: s.expiresAt?.toISOString() ?? null,
      revokedAt: s.revokedAt?.toISOString() ?? null,
      lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      active: !s.revokedAt && (!s.expiresAt || s.expiresAt.getTime() > now),
    })),
  })
})

export const POST = withOrg(async (request, { user, orgId }) => {
  const limited = await rateLimit(request, 'portal_create', { limit: 20, windowSeconds: 3600 })
  if (limited) return limited

  if ((await getOrgRole(orgId, user.id)) !== 'OWNER') {
    return Response.json({ error: 'Only the owner can create portal links' }, { status: 403 })
  }

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'A label and at least one section are required' }, { status: 400 })

  const raw = randomBytes(32).toString('base64url')
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
    : null

  const share = await prisma.portalShare.create({
    data: {
      orgId,
      label: parsed.data.label,
      tokenHash: hashPortalToken(raw),
      scopes: parsed.data.scopes.join(','),
      createdById: user.id,
      expiresAt,
    },
    select: { id: true, label: true, scopes: true, expiresAt: true },
  })

  const portalUrl = `${new URL(request.url).origin}/portal/${raw}`
  return Response.json(
    { id: share.id, label: share.label, scopes: share.scopes.split(','), expiresAt: share.expiresAt?.toISOString() ?? null, portalUrl },
    { status: 201 },
  )
})
