/**
 * Navi action confirmation — runs a side-effecting action the agent PROPOSED,
 * only after the user explicitly confirms it in the UI. The agent loop never
 * executes actions itself; this is the single place they run.
 *
 * Org-scoped via the session. Only tools registered as kind:'action' can run
 * here, and only by exact name — the client can't invoke arbitrary code.
 */
import { withOrg } from '@/lib/api/with-org'
import { ACTION_TOOLS } from '@/lib/navi/tools'

export const POST = withOrg(async (request, { orgId }) => {
  let body: { tool?: string; input?: Record<string, unknown> }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const tool = ACTION_TOOLS.find((t) => t.name === body.tool)
  if (!tool) return Response.json({ error: 'Unknown or non-actionable tool.' }, { status: 400 })

  try {
    const result = await tool.run(orgId, body.input ?? {})
    return Response.json({ ok: true, result })
  } catch (e) {
    console.error('Navi action failed:', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Action failed.' }, { status: 200 })
  }
})
