import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'

// Set the org's business type. Drives the metric registry + Navi-score
// benchmarks. Raw SQL write so it works before `prisma generate` picks up the
// new column on the build host. Busts the org cache so metrics recompute.
const Schema = z.object({
  industry: z.enum(['saas', 'ecommerce', 'restaurant', 'agency', 'proservices', 'trades', 'manufacturing', 'healthcare', 'realestate', 'nonprofit', 'generic']),
})

export const POST = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, Schema)
  if (!parsed.ok) return parsed.response
  await prisma.$executeRaw(Prisma.sql`UPDATE "Organization" SET "industry" = ${parsed.data.industry} WHERE "id" = ${orgId}`)
  await cache.delPattern(`org:${orgId}:*`).catch(() => {})
  return Response.json({ ok: true, industry: parsed.data.industry })
})
