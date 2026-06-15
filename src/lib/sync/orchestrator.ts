/**
 * Sync orchestrator — the single entry point for background data sync.
 *
 * DESIGN (target architecture, built minimal-but-queue-ready):
 *
 *   webhook ─┐
 *   cron ────┼──► enqueueSync(job) ──► [today: in-process runner]
 *   manual ──┘                         [later: SQS/QStash worker — same job shape]
 *                       │
 *                       ▼
 *              runSyncJob(orgId, provider)
 *                ├─ distributed lock  (one sync per org+provider at a time)
 *                ├─ cooldown          (coalesce bursts: skip if synced < 60s ago)
 *                ├─ provider dispatch (SYNC_DISPATCH table)
 *                └─ persist → Transaction / MrrSnapshot (idempotent upserts)
 *
 * Scope: providers whose sync PERSISTS data (Plaid, Stripe, QuickBooks, Xero).
 * Gusto/ADP/GHL/Shopify are fetched live at request time and persist nothing —
 * there is nothing for a background sweep to keep fresh yet. When those gain
 * persistence (or cache-warming), they get a row in SYNC_DISPATCH and nothing
 * else changes.
 *
 * Locks/cooldowns use Redis when configured (correct across instances; sync
 * runs in one cron process today) with an in-memory fallback for dev.
 */
import type { IntegrationProvider } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import { syncTransactions } from '@/lib/integrations/plaid'
import { syncStripeData, captureMrrSnapshot } from '@/lib/integrations/stripe'
import { syncQuickBooksTransactions } from '@/lib/integrations/quickbooks'
import { syncXeroTransactions } from '@/lib/integrations/xero'
import { syncMetaAds } from '@/lib/integrations/meta-ads'
import { syncGoogleAds } from '@/lib/integrations/google-ads'
import { log, errField } from '@/lib/log'

const LOCK_TTL_S = 120 // max expected single-sync duration; lock self-expires
const COOLDOWN_S = 60 // coalesce window: bursts within this collapse to one run

// ─── Provider dispatch ─────────────────────────────────────────────────────────

type SyncFn = (orgId: string) => Promise<unknown>

export const SYNC_DISPATCH: Partial<Record<IntegrationProvider, SyncFn>> = {
  PLAID: (orgId) => syncTransactions(orgId),
  STRIPE: async (orgId) => {
    await syncStripeData(orgId)
    // Monthly MRR snapshot is idempotent (unique per org+sub+period).
    await captureMrrSnapshot(orgId).catch(() => {})
  },
  QUICKBOOKS: (orgId) => syncQuickBooksTransactions(orgId),
  XERO: (orgId) => syncXeroTransactions(orgId),
  // Ad platforms persist daily AdInsight rows — the spend-validation popover
  // reads them, so the sweep keeps them fresh like any other ledger source.
  META_ADS: (orgId) => syncMetaAds(orgId),
  GOOGLE_ADS: (orgId) => syncGoogleAds(orgId),
}

export const SYNCABLE_PROVIDERS = Object.keys(SYNC_DISPATCH) as IntegrationProvider[]

// ─── Locks & cooldowns (Redis with in-memory dev fallback) ────────────────────

const memKeys = new Map<string, number>() // key → expiresAt epoch ms

function memAcquire(key: string, ttlS: number): boolean {
  const now = Date.now()
  const exp = memKeys.get(key)
  if (exp && now < exp) return false
  memKeys.set(key, now + ttlS * 1000)
  if (memKeys.size > 10_000) {
    for (const [k, e] of memKeys) if (now >= e) memKeys.delete(k)
  }
  return true
}

/** Atomic acquire: true = we own the key for ttlS seconds. */
async function acquire(key: string, ttlS: number): Promise<boolean> {
  const redis = getRedis()
  if (redis) {
    try {
      // SET NX EX — atomic test-and-set with expiry.
      return (await redis.set(key, '1', 'EX', ttlS, 'NX')) === 'OK'
    } catch {
      return memAcquire(key, ttlS)
    }
  }
  return memAcquire(key, ttlS)
}

async function release(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) await redis.del(key).catch(() => memKeys.delete(key))
  else memKeys.delete(key)
}

// ─── Core job runner ───────────────────────────────────────────────────────────

export type SyncOutcome = 'synced' | 'skipped_cooldown' | 'skipped_locked' | 'failed' | 'no_dispatch'

/**
 * Run one sync job with locking + coalescing. Safe to call from anywhere
 * (cron, webhook handler, manual route) — overlapping callers collapse.
 */
export async function runSyncJob(orgId: string, provider: IntegrationProvider): Promise<SyncOutcome> {
  const fn = SYNC_DISPATCH[provider]
  if (!fn) return 'no_dispatch'

  const cooldownKey = `sync:cooldown:${orgId}:${provider}`
  const lockKey = `sync:lock:${orgId}:${provider}`

  // Recent successful sync → nothing to do (burst coalescing).
  if (!(await acquire(cooldownKey, COOLDOWN_S))) return 'skipped_cooldown'

  // Someone else is mid-sync for this org+provider → let them finish.
  if (!(await acquire(lockKey, LOCK_TTL_S))) return 'skipped_locked'

  try {
    await fn(orgId)
    return 'synced'
  } catch (err) {
    log.error('sync_failed', { provider, orgId, err: errField(err) })
    return 'failed'
  } finally {
    await release(lockKey)
  }
}

/**
 * Queue seam. Today this runs the job in-process; swapping to a real queue
 * (SQS/QStash) means changing ONLY this function to publish the job — every
 * caller already speaks in jobs.
 */
export async function enqueueSync(job: { orgId: string; provider: IntegrationProvider }): Promise<SyncOutcome> {
  return runSyncJob(job.orgId, job.provider)
}

// ─── Cron sweep ────────────────────────────────────────────────────────────────

/** Run an async mapper over items with at most `limit` in flight. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export type SweepSummary = {
  total: number
  synced: number
  skipped: number
  failed: number
  at: string
}

/**
 * Backstop sweep over every connected, syncable integration. Bounded
 * concurrency so 10k orgs don't become 10k simultaneous provider calls —
 * per-provider API budgets stay bounded at `concurrency` regardless of scale.
 */
export async function runCronSweep(concurrency = 5): Promise<SweepSummary> {
  const integrations = await prisma.integration.findMany({
    where: { status: 'CONNECTED', provider: { in: SYNCABLE_PROVIDERS } },
    select: { orgId: true, provider: true },
    orderBy: { lastSyncedAt: 'asc' }, // stalest first — fair under time limits
  })

  const outcomes = await mapWithConcurrency(integrations, concurrency, (i) =>
    enqueueSync({ orgId: i.orgId, provider: i.provider }),
  )

  const summary = {
    total: outcomes.length,
    synced: outcomes.filter((o) => o === 'synced').length,
    skipped: outcomes.filter((o) => o === 'skipped_cooldown' || o === 'skipped_locked').length,
    failed: outcomes.filter((o) => o === 'failed' || o === 'no_dispatch').length,
    at: new Date().toISOString(),
  }
  log.info('sync_sweep_complete', summary)
  return summary
}
