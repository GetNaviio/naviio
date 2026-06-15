import { prisma } from '@/lib/prisma'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Nightly data-retention purge (SEC-POL-003 §4). Enforces the documented
 * retention windows automatically so nothing is retained past its period:
 *
 *   1. Accounts flagged for deletion (deletedAt) past the 30-day grace window
 *      are hard-deleted — cascading to their orgs, integrations, transactions,
 *      and MRR snapshots (FK onDelete: Cascade). This completes the §5.2
 *      "permanently delete all financial data within 30 days" obligation.
 *   2. Bank transactions older than 25 months from collection date.
 *   3. MRR snapshots older than 25 months.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as /api/cron/sync).
 * Every run logs a structured summary (timestamp + per-category counts) so purge
 * events are auditable, per policy.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed if not configured
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  // Constant-time comparison (see cron/sync) — plain === leaks via timing.
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const now = Date.now()
  const graceCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000) // 30-day deletion grace
  const retentionCutoff = new Date(now - 25 * MONTH_MS)        // 25-month retention

  const summary: Record<string, number> = {}
  const errors: string[] = []

  // 1) Hard-delete accounts past the deletion grace window (cascades all data).
  try {
    const { count } = await prisma.user.deleteMany({
      where: { deletedAt: { not: null, lte: graceCutoff } },
    })
    summary.deletedAccounts = count
  } catch (e) {
    errors.push(`deletedAccounts: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2) Bank transactions past the 25-month retention window (by collection date).
  try {
    const { count } = await prisma.transaction.deleteMany({
      where: { createdAt: { lt: retentionCutoff } },
    })
    summary.transactions = count
  } catch (e) {
    errors.push(`transactions: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 3) MRR snapshots past the 25-month retention window.
  try {
    const { count } = await prisma.mrrSnapshot.deleteMany({
      where: { createdAt: { lt: retentionCutoff } },
    })
    summary.mrrSnapshots = count
  } catch (e) {
    errors.push(`mrrSnapshots: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Audit log of the purge run (SEC-POL-003 §4: timestamp, category, count, errors).
  console.warn('[retention-purge]', JSON.stringify({ at: new Date().toISOString(), summary, errors }))

  return Response.json({ ok: errors.length === 0, summary, errors })
}
