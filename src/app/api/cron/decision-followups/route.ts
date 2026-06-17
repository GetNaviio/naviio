/**
 * Proactive decision follow-ups (daily cron).
 *
 * Finds decisions Navi answered a while ago that still have no recorded outcome,
 * and raises a gentle alert ("you weighed X — did you go ahead?"). The user
 * answers from the decision drill-down, which closes the predicted-vs-actual
 * loop and turns the decision log into a learning dataset.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as the other crons).
 * Idempotent: `followedUpAt` is stamped when prompted, so no decision is pinged
 * twice.
 */
import { randomUUID, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed if not configured
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Decisions older than 7 days, no outcome yet, not already prompted.
    const rows = await prisma.$queryRaw<{ id: string; orgId: string; headline: string }[]>`
      SELECT "id", "orgId", "headline" FROM "DecisionLog"
      WHERE "outcome" IS NULL AND "followedUpAt" IS NULL AND "createdAt" < now() - interval '7 days'
      ORDER BY "createdAt" ASC
      LIMIT 200
    `

    let prompted = 0
    for (const r of rows) {
      const message = `You weighed: “${r.headline}” Did you go ahead? Open Navi to tell it how it turned out — it helps your future forecasts.`
      await prisma.$executeRaw`
        INSERT INTO "Alert" ("id","orgId","type","message","severity","isRead","createdAt")
        VALUES (${randomUUID()}, ${r.orgId}, 'decision_followup', ${message}, 'INFO'::"AlertSeverity", false, now())
      `
      await prisma.$executeRaw`UPDATE "DecisionLog" SET "followedUpAt" = now() WHERE "id" = ${r.id}`
      prompted++
    }

    return Response.json({ ok: true, prompted, candidates: rows.length })
  } catch (e) {
    // Degrade gracefully (e.g. before the followedUpAt migration is applied).
    console.error('decision-followups cron failed:', e)
    return Response.json({ ok: false, error: 'cron_failed' }, { status: 200 })
  }
}
