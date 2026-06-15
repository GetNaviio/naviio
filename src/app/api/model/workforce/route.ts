import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'

const YM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM')

const RoleSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    department: z.string().trim().max(60).optional().nullable(),
    headcount: z.number().int().min(1).max(10_000),
    monthlySalary: z.number().finite().min(0).max(10_000_000),
    loadedPct: z.number().finite().min(0).max(200),
    startMonth: YM,
    endMonth: YM.nullable().optional(),
  })
  .refine((r) => !r.endMonth || r.endMonth >= r.startMonth, {
    message: 'endMonth must not precede startMonth',
    path: ['endMonth'],
  })

export const GET = withOrg(async (_request, { orgId }) => {
  const roles = await prisma.workforceRole.findMany({
    where: { orgId },
    orderBy: [{ startMonth: 'asc' }, { createdAt: 'asc' }],
  })
  return Response.json({ roles })
})

export const POST = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, RoleSchema)
  if (!parsed.ok) return parsed.response
  const role = await prisma.workforceRole.create({
    data: {
      orgId,
      ...parsed.data,
      department: parsed.data.department?.trim() || null,
      endMonth: parsed.data.endMonth ?? null,
    },
  })
  return Response.json({ role }, { status: 201 })
})

export const DELETE = withOrg(async (request, { orgId }) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  // Scoped by orgId — never another tenant's row.
  const { count } = await prisma.workforceRole.deleteMany({ where: { id, orgId } })
  if (count === 0) return Response.json({ error: 'Role not found' }, { status: 404 })
  return Response.json({ success: true })
})
