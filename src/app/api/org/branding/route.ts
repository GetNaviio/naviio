/**
 * White-label branding for the active org (FIRM feature).
 *   GET   — current branding + whether this account may edit it (owner of a
 *           firm-managed org)
 *   PATCH — set logo URL / brand color / hide-Naviio (owner only, and only on
 *           a firm-managed org — white-label is a fractional-CFO firm capability)
 *
 * Gating note: white-label is firm-only. It is available on orgs that belong to
 * a firm (Organization.firmId set) — i.e. client entities under a fractional CFO
 * — so the firm can brand each client. Individual (non-firm) plans, including
 * CFO Suite, do not get per-org white-label.
 */
import { z } from 'zod'
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { getOrgRole } from '@/lib/org'
import { brandingFrom, isValidLogoUrl, isValidBrandColor } from '@/lib/branding'

const PatchSchema = z.object({
  logoUrl: z.string().trim().max(2048).nullish(),
  color: z.string().trim().max(7).nullish(),
  hideNaviioBranding: z.boolean().optional(),
})

export const GET = withOrg(async (_request, { user, orgId }) => {
  const [role, org] = await Promise.all([
    getOrgRole(orgId, user.id),
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { plan: true, firmId: true, brandLogoUrl: true, brandColor: true, hideNaviioBranding: true },
    }),
  ])
  return Response.json({
    branding: brandingFrom(org),
    // White-label is firm-only: editable by the owner of a firm-managed org.
    canEdit: role === 'OWNER' && org.firmId != null,
    isFirmOrg: org.firmId != null,
  })
})

export const PATCH = withOrg(async (request, { user, orgId }) => {
  const [role, org] = await Promise.all([
    getOrgRole(orgId, user.id),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { firmId: true } }),
  ])
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can change branding' }, { status: 403 })
  if (org.firmId == null) {
    return Response.json(
      { error: 'White-label branding is a fractional-CFO firm feature', code: 'FIRM_REQUIRED' },
      { status: 403 },
    )
  }

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid branding payload' }, { status: 400 })
  const { logoUrl, color, hideNaviioBranding } = parsed.data

  // Validate non-empty values; empty string / null clears the field.
  if (logoUrl && !isValidLogoUrl(logoUrl)) {
    return Response.json({ error: 'Logo must be a valid https image URL' }, { status: 400 })
  }
  if (color && !isValidBrandColor(color)) {
    return Response.json({ error: 'Color must be a hex value like #2563EB' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (logoUrl !== undefined) data.brandLogoUrl = logoUrl || null
  if (color !== undefined) data.brandColor = color || null
  if (hideNaviioBranding !== undefined) data.hideNaviioBranding = hideNaviioBranding

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data,
    select: { brandLogoUrl: true, brandColor: true, hideNaviioBranding: true },
  })
  return Response.json({ ok: true, branding: brandingFrom(updated) })
})
