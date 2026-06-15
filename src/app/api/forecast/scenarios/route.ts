import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'
import { DEFAULT_SCENARIOS } from '@/lib/forecasting/engine'
import type { ForecastScenario } from '@/types'

// Custom scenarios are persisted per-org (ForecastScenario table). Built-in
// bear/base/bull cases stay in code. Response shapes are unchanged from the
// previous in-memory implementation.

const ScenarioSchema = z.object({
  name: z.string().trim().min(1).max(100),
  assumptions: z.object({
    growthMultiplier: z.number().finite().min(0).max(10),
    churnMultiplier: z.number().finite().min(0).max(10),
    opexGrowthMultiplier: z.number().finite().min(0).max(10),
  }),
})

type ScenarioRow = {
  id: string
  name: string
  growthMultiplier: number
  churnMultiplier: number
  opexGrowthMultiplier: number
}

function toApiShape(row: ScenarioRow): ForecastScenario {
  return {
    id: row.id,
    name: row.name,
    type: 'custom',
    assumptions: {
      growthMultiplier: row.growthMultiplier,
      churnMultiplier: row.churnMultiplier,
      opexGrowthMultiplier: row.opexGrowthMultiplier,
    },
  }
}

export const GET = withOrg(async (_request, { orgId }) => {
  const custom = await prisma.forecastScenario.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  })
  return Response.json({ scenarios: [...DEFAULT_SCENARIOS, ...custom.map(toApiShape)] })
})

export const POST = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, ScenarioSchema)
  if (!parsed.ok) return parsed.response
  const { name, assumptions } = parsed.data

  const row = await prisma.forecastScenario.create({
    data: { orgId, name, ...assumptions },
  })
  return Response.json({ scenario: toApiShape(row) }, { status: 201 })
})

export const DELETE = withOrg(async (request, { orgId }) => {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  // deleteMany scoped by orgId: a user can never delete another org's scenario.
  const { count } = await prisma.forecastScenario.deleteMany({ where: { id, orgId } })
  if (count === 0) return Response.json({ error: 'Scenario not found' }, { status: 404 })
  return Response.json({ success: true })
})
