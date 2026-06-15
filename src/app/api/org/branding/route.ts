/**
 * White-label branding for the active org (CFO Suite).
 *   GET   — current branding + whether this account may edit it (owner+CFO)
 *   PATCH — set logo URL / brand color / hide-Naviio (owner only, and only on
 *           a CFO-plan org — white-label is a CFO Suite capability)
 *
 * Gating note: the CFO check is on the ACTIVE org's plan. Client entities
 * created under a CFO subscription are themselves CFO-plan (§AG), so a
 * fractional CFO can brand each client entity individually.
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
      select: { plan: true, brandLogoUrl: true, brandColor: true, hideNaviioBranding: true },
    }),
  ])
  return Response.json({
    branding: brandingFrom(org),
    canEdit: role === 'OWNER' && org.plan === 'CFO',
    plan: org.plan,
  })
})

export const PATCH = withOrg(async (request, { user, orgId }) => {
  const [role, org] = await Promise.all([
    getOrgRole(orgId, user.id),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } }),
  ])
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can change branding' }, { status: 403 })
  if (org.plan !== 'CFO') {
    return Response.json(
      { error: 'White-label branding is a CFO Suite feature', code: 'CFO_REQUIRED' },
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
