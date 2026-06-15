import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { loadWorkbook, parseBudgetSheet } from '@/lib/model/fpa-xlsx'

export const runtime = 'nodejs'
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — a budget grid is tiny; reject anything bulky

/**
 * Import a budget from an .xlsx file (the exported Budget sheet is the
 * template; Google Sheets users download as .xlsx). Upserts by (month, line) —
 * idempotent, so re-importing the same file is safe.
 */
export const POST = withOrg(async (request, { orgId }) => {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof Blob)) {
    return Response.json({ error: 'Attach the .xlsx file as the "file" form field.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File too large (max 2 MB).' }, { status: 413 })
  }

  let parsed
  try {
    const wb = await loadWorkbook(await file.arrayBuffer())
    parsed = parseBudgetSheet(wb)
  } catch {
    return Response.json({ error: 'Could not read the file — is it a valid .xlsx?' }, { status: 400 })
  }
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 })

  await prisma.$transaction(
    parsed.rows.map((l) =>
      prisma.budgetLine.upsert({
        where: { orgId_month_line: { orgId, month: l.month, line: l.line } },
        create: { orgId, month: l.month, line: l.line, amount: l.amount },
        update: { amount: l.amount },
      }),
    ),
  )

  return Response.json({ imported: parsed.rows.length })
})
