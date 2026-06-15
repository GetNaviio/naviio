import { prisma } from '@/lib/prisma'

// Liveness probe for the ALB target group health check. Intentionally light —
// returns 200 without touching the database, so a transient DB blip doesn't cause
// the load balancer to kill healthy app tasks (which would turn a DB hiccup into a
// full outage).
//
// `?deep=1` adds a DB round-trip (SELECT 1) — for post-deploy smoke checks and
// external uptime monitors, where "app is up but can't reach Postgres" MUST page.
// Never point a load balancer at the deep variant.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === '1'
  if (!deep) return Response.json({ status: 'ok', ts: new Date().toISOString() })

  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', db: 'ok', ts: new Date().toISOString() })
  } catch {
    return Response.json(
      { status: 'degraded', db: 'unreachable', ts: new Date().toISOString() },
      { status: 503 },
    )
  }
}
