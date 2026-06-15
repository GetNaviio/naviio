import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { loadWorkbook, parseWorkforceSheet } from '@/lib/model/fpa-xlsx'

export const runtime = 'nodejs'
const MAX_BYTES = 2 * 1024 * 1024
const MAX_ROLES = 2_000

/**
 * Import a workforce plan from an .xlsx file (the exported Workforce sheet is
 * the template). Two modes via the "mode" form field:
 *   - "append" (default): adds the rows to the existing plan
 *   - "replace": replaces the entire plan atomically (delete + insert in one
 *     transaction — a failed import never leaves a half-empty plan)
 */
export const POST = withOrg(async (request, { orgId }) => {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const mode = form?.get('mode') === 'replace' ? 'replace' : 'append'
  if (!(file instanceof Blob)) {
    return Response.json({ error: 'Attach the .xlsx file as the "file" form field.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File too large (max 2 MB).' }, { status: 413 })
  }

  let parsed
  try {
    const wb = await loadWorkbook(await file.arrayBuffer())
    parsed = parseWorkforceSheet(wb)
  } catch {
    return Response.json({ error: 'Could not read the file — is it a valid .xlsx?' }, { status: 400 })
  }
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 })
  if (parsed.rows.length > MAX_ROLES) {
    return Response.json({ error: `Too many roles (max ${MAX_ROLES}).` }, { status: 422 })
  }

  const data = parsed.rows.map((r) => ({ orgId, ...r }))
  await prisma.$transaction([
    ...(mode === 'replace' ? [prisma.workforceRole.deleteMany({ where: { orgId } })] : []),
    prisma.workforceRole.createMany({ data }),
  ])

  return Response.json({ imported: data.length, mode })
})
