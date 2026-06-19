/**
 * Firm white-label branding (CFO Suite). GET returns the CFO's firm + branding;
 * PUT updates name / logo / accent color. White-label only — no auth grant.
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner, updateFirmBranding } from '@/lib/firm/firm'

export const GET = withAuth(async (_request, { user }) => {
  const firm = await getFirmForOwner(user.id)
  return Response.json({ firm })
})

const BrandingSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brandLogoUrl: z.string().trim().url().max(2048).nullable().optional(),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB hex color')
    .nullable()
    .optional(),
})

export const PUT = withAuth(async (request, { user }) => {
  const body = await request.json().catch(() => null)
  const parsed = BrandingSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid branding fields' }, { status: 400 })

  const firm = await updateFirmBranding(user.id, parsed.data)
  if (!firm) return Response.json({ error: 'No firm yet — add your first client to create one.' }, { status: 404 })
  return Response.json({ firm })
})
