/**
 * Integration requests — demand votes for catalog connectors we haven't
 * built yet. GET returns this org's requested slugs (so the UI can render
 * "Requested ✓"); POST records a vote (idempotent); DELETE withdraws it.
 * Roadmap priority = `SELECT slug, COUNT(*) FROM "IntegrationRequest" GROUP BY slug`.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'
import { isKnownComingSoon } from '@/lib/integrations/catalog'

const RequestSchema = z.object({
  slug: z.string().trim().min(1).max(60),
})

export const GET = withOrg(async (_request, { orgId }) => {
  const rows = await prisma.integrationRequest.findMany({
    where: { orgId },
    select: { slug: true },
  })
  return Response.json({ requested: rows.map((r) => r.slug) })
})

export const POST = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, RequestSchema)
  if (!parsed.ok) return parsed.response
  const { slug } = parsed.data
  if (!isKnownComingSoon(slug)) {
    return Response.json({ error: 'Unknown integration' }, { status: 400 })
  }
  // Idempotent: re-requesting is a no-op, never an error.
  await prisma.integrationRequest.upsert({
    where: { orgId_slug: { orgId, slug } },
    create: { orgId, slug },
    update: {},
  })
  return Response.json({ success: true, slug }, { status: 201 })
})

export const DELETE = withOrg(async (request, { orgId }) => {
  const slug = new URL(request.url).searchParams.get('slug')
  if (!slug) return Response.json({ error: 'slug is required' }, { status: 400 })
  await prisma.integrationRequest.deleteMany({ where: { orgId, slug } })
  return Response.json({ success: true })
})
