/**
 * Nightly peer-benchmark rebuild (cron). Recomputes the anonymized vendor-spend
 * histogram across all orgs.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as the other crons).
 */
import { timingSafeEqual } from 'crypto'
import { rebuildVendorBenchmarks } from '@/lib/benchmarks/aggregate'
import { snapshotVendorBenchmarks, currentPeriod } from '@/lib/benchmarks/snapshot'

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await rebuildVendorBenchmarks()
    // Snapshot the current month's medians (upsert) so price trends accrue.
    const snap = await snapshotVendorBenchmarks(currentPeriod())
    return Response.json({ ok: true, ...result, snapshots: snap.rows })
  } catch (e) {
    console.error('benchmark rebuild failed:', e)
    return Response.json({ error: 'rebuild failed' }, { status: 500 })
  }
}
