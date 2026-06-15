import { runCronSweep } from '@/lib/sync/orchestrator'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
// Allow up to 60s on platforms that honor it (e.g. Vercel) — syncing many orgs.
export const maxDuration = 60

/**
 * Scheduled sync. Backstop to the real-time webhooks: sweeps every connected,
 * syncable integration (Plaid, Stripe, QuickBooks, Xero — see SYNC_DISPATCH)
 * through the orchestrator, stalest first, with bounded concurrency and
 * per-org+provider locks so overlapping cron runs / webhooks / manual syncs
 * never double-fetch. Trigger it on a schedule from any cron service
 * (Vercel Cron, cron-job.org, a crontab, GitHub Actions, …).
 *
 * Auth: send `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends this
 * automatically when CRON_SECRET is set in the project env. The secret is never
 * placed in the URL.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed if not configured
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  // Constant-time comparison — a plain === leaks match-prefix length through
  // response timing, which lets an attacker recover the secret byte by byte.
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runCronSweep()
    return Response.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[cron/sync] failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Sync failed' }, { status: 500 })
  }
}

// GET for Vercel Cron / simple schedulers; POST for services that prefer it.
export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
