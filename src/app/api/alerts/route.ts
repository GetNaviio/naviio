import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const KNOWN_TYPES = new Set(['low_cash', 'anomaly', 'milestone', 'churn_risk', 'revenue_drop'])
const TITLES: Record<string, string> = {
  low_cash: 'Low cash',
  anomaly: 'Spending anomaly',
  milestone: 'Milestone reached',
  churn_risk: 'Churn risk',
  revenue_drop: 'Revenue drop',
}

/** Map a DB Alert → the shape the UI AlertFeed expects (no demo fallback). */
function toUiAlert(a: { id: string; type: string; message: string; severity: string; isRead: boolean; createdAt: Date }) {
  const type = KNOWN_TYPES.has(a.type) ? a.type : 'anomaly'
  return {
    id: a.id,
    type,
    severity: a.severity.toLowerCase(),
    title: TITLES[type] ?? 'Alert',
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    readAt: a.isRead ? a.createdAt.toISOString() : null,
  }
}

export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)
    const rows = await prisma.alert.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 100 })
    return Response.json({ alerts: rows.map(toUiAlert) })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ alerts: [] })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)
    const body = await request.json().catch(() => ({}))

    if (body.all) {
      const { count } = await prisma.alert.updateMany({ where: { orgId, isRead: false }, data: { isRead: true } })
      return Response.json({ success: true, updated: count })
    }
    if (body.id) {
      // Org-scoped — prevents marking another org's alert read (IDOR fix).
      const { count } = await prisma.alert.updateMany({ where: { id: body.id, orgId }, data: { isRead: true } })
      return Response.json({ success: count > 0 })
    }
    return Response.json({ error: 'id or all required' }, { status: 400 })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
