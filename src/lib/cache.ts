import { getRedis } from './redis'

// ─── In-memory fallback (development / no Redis) ──────────────────────────────

interface CacheEntry { value: string; expiresAt: number | null }
const memStore = new Map<string, CacheEntry>()

function memGet(key: string): string | null {
  const entry = memStore.get(key)
  if (!entry) return null
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    memStore.delete(key)
    return null
  }
  return entry.value
}

function memSet(key: string, value: string, ttlSeconds?: number): void {
  memStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  })
}

function memDel(key: string): void { memStore.delete(key) }
function memFlush(): void { memStore.clear() }

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss.
 * Automatically parses JSON if the stored value is valid JSON.
 */
export async function get<T = string>(key: string): Promise<T | null> {
  const client = getRedis()
  const raw = client ? await client.get(key).catch(() => null) : memGet(key)
  if (raw === null) return null
  try { return JSON.parse(raw) as T } catch { return raw as unknown as T }
}

/**
 * Set a cached value with optional TTL in seconds.
 * Automatically serialises non-string values to JSON.
 */
export async function set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialised = typeof value === 'string' ? value : JSON.stringify(value)
  const client = getRedis()
  if (client) {
    const cmd = ttlSeconds
      ? client.set(key, serialised, 'EX', ttlSeconds)
      : client.set(key, serialised)
    await cmd.catch(() => memSet(key, serialised, ttlSeconds))
  } else {
    memSet(key, serialised, ttlSeconds)
  }
}

/** Delete a cached key. */
export async function del(key: string): Promise<void> {
  const client = getRedis()
  if (client) {
    await client.del(key).catch(() => memDel(key))
  } else {
    memDel(key)
  }
}

/**
 * Delete all keys matching a glob pattern (e.g. "org:abc:*").
 * Uses SCAN, not KEYS — KEYS is O(total keys) and blocks Redis's single
 * thread, which stalls every other caller once the keyspace is large.
 */
export async function delPattern(pattern: string): Promise<void> {
  const client = getRedis()
  if (client) {
    try {
      let cursor = '0'
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
        cursor = next
        if (keys.length) await client.del(...keys)
      } while (cursor !== '0')
    } catch {
      // best-effort, same contract as before
    }
  } else {
    const rx = new RegExp(
      '^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    )
    for (const key of [...memStore.keys()]) {
      if (rx.test(key)) memStore.delete(key)
    }
  }
}

/** Flush the entire cache. Use with care in production. */
export async function flush(): Promise<void> {
  const client = getRedis()
  if (client) {
    await client.flushdb().catch(() => memFlush())
  } else {
    memFlush()
  }
}

// ─── TTL constants ────────────────────────────────────────────────────────────

export const TTL = {
  SHORT:  60,          // 1 minute  — rate limits, OTP
  MEDIUM: 60 * 15,     // 15 min    — dashboard summaries
  LONG:   60 * 60,     // 1 hour    — integration data
  DAY:    60 * 60 * 24,// 24 hours  — reports, slow-changing data
} as const

// ─── Cache key helpers ────────────────────────────────────────────────────────

export const cacheKey = {
  dashboard:    (orgId: string) => `org:${orgId}:dashboard`,
  forecast:     (orgId: string, months: number) => `org:${orgId}:forecast:${months}`,
  report:       (orgId: string, reportId: string) => `org:${orgId}:report:${reportId}`,
  integration:  (orgId: string, provider: string) => `org:${orgId}:integration:${provider}`,
  transactions: (orgId: string, page: number) => `org:${orgId}:txn:${page}`,
}
