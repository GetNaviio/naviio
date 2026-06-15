import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'

const YM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM')

const SaveSchema = z.object({
  lines: z
    .array(
      z.object({
        month: YM,
        line: z.enum(['REVENUE', 'COGS', 'OPEX']),
        amount: z.number().finite().min(0).max(1_000_000_000),
      }),
    )
    .max(120), // 12 months × 3 lines, with headroom
})

/** GET ?year=YYYY → all budget lines for that year (default: current UTC year). */
export const GET = withOrg(async (request, { orgId }) => {
  const yearParam = new URL(request.url).searchParams.get('year')
  const year = /^\d{4}$/.test(yearParam ?? '') ? yearParam : String(new Date().getUTCFullYear())
  const lines = await prisma.budgetLine.findMany({
    where: { orgId, month: { startsWith: `${year}-` } },
    orderBy: { month: 'asc' },
    select: { month: true, line: true, amount: true },
  })
  return Response.json({ year, lines })
})

/** PUT — bulk upsert the budget grid in one transaction (idempotent save). */
export const PUT = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, SaveSchema)
  if (!parsed.ok) return parsed.response

  await prisma.$transaction(
    parsed.data.lines.map((l) =>
      prisma.budgetLine.upsert({
        where: { orgId_month_line: { orgId, month: l.month, line: l.line } },
        create: { orgId, month: l.month, line: l.line, amount: l.amount },
        update: { amount: l.amount },
      }),
    ),
  )
  return Response.json({ saved: parsed.data.lines.length })
})
