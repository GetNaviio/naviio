/**
 * Single shared ioredis client for the whole app (cache, rate limiting, …).
 *
 * Previously cache.ts and rate-limit.ts each created their own connection —
 * at N instances × M modules that multiplies connections against Redis for no
 * benefit. One lazy client per process, with the same silent-fallback contract:
 * callers get `null` when Redis is unconfigured or unhealthy and degrade to
 * their in-memory paths.
 */
import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { __redis?: Redis | null }

export function getRedis(): Redis | null {
  if (globalForRedis.__redis) return globalForRedis.__redis
  const url = process.env.REDIS_URL
  if (!url) return null

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    client.on('error', () => {
      // Silently fall back to in-memory on connection errors
      globalForRedis.__redis = null
    })
    globalForRedis.__redis = client
    return client
  } catch {
    return null
  }
}
