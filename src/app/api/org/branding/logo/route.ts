/**
 * White-label logo upload (firm feature). Owner of a firm-managed org uploads an
 * image; we store it in public Blob storage and set brandLogoUrl to the
 * resulting https URL — the same field the portal renders, so nothing else
 * changes downstream.
 *
 * Accepts PNG / JPEG / WebP only, ≤2 MB. SVG is excluded on purpose (it can
 * carry script; even though <img> won't execute it, we don't host untrusted
 * markup on our domain). The returned URL is on Blob's domain, not ours.
 */
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { getOrgRole } from '@/lib/org'
import { putPublic, blobConfigured } from '@/lib/blob'

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const POST = withOrg(async (request, { user, orgId }) => {
  const limited = await rateLimit(request, 'logo_upload', { limit: 20, windowSeconds: 3600 })
  if (limited) return limited

  const [role, org] = await Promise.all([
    getOrgRole(orgId, user.id),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { firmId: true } }),
  ])
  if (role !== 'OWNER') return Response.json({ error: 'Only the owner can change branding' }, { status: 403 })
  if (org.firmId == null) {
    return Response.json({ error: 'White-label branding is a fractional-CFO firm feature', code: 'FIRM_REQUIRED' }, { status: 403 })
  }
  if (!blobConfigured()) {
    return Response.json(
      { error: 'Logo storage is not configured on this server. Set BLOB_READ_WRITE_TOKEN, or paste a logo URL instead.' },
      { status: 503 },
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'No file provided' }, { status: 400 })

  const ext = ALLOWED[file.type]
  if (!ext) return Response.json({ error: 'Logo must be a PNG, JPEG, or WebP image' }, { status: 415 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'Logo must be 2 MB or smaller' }, { status: 413 })

  let url: string
  try {
    const bytes = await file.arrayBuffer()
    url = await putPublic(`branding/${orgId}/logo.${ext}`, bytes, file.type)
  } catch {
    return Response.json({ error: 'Upload failed — please try again' }, { status: 502 })
  }

  await prisma.organization.update({ where: { id: orgId }, data: { brandLogoUrl: url } })
  return Response.json({ ok: true, logoUrl: url }, { status: 201 })
})
