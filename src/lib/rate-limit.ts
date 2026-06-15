/**
 * Fixed-window rate limiter. Redis-backed when REDIS_URL is set (atomic
 * INCR+EXPIRE — correct across instances); in-memory fallback otherwise
 * (fine for a single dev process, NOT for multi-instance production).
 *
 * Usage in a route:
 *   const limited = await rateLimit(request, 'login', { limit: 10, windowSeconds: 60 })
 *   if (limited) return limited   // ready 429 Response
 *
 * Keyed by client IP (x-forwarded-for first hop — set by Vercel/ALB) + bucket.
 * Fail-open: a Redis outage must never lock every user out of login.
 */
import { getRedis } from './redis'

type Options = { limit: number; windowSeconds: number }

// Sensible defaults per surface; tune per route as traffic patterns emerge.
export const LIMITS = {
  login: { limit: 10, windowSeconds: 60 },       // brute-force guard
  register: { limit: 5, windowSeconds: 60 },     // bot signups
  waitlist: { limit: 5, windowSeconds: 60 },     // public form spam
  mfa: { limit: 5, windowSeconds: 60 },          // TOTP guessing (6 digits)
  expensive: { limit: 30, windowSeconds: 60 },   // AI / sync endpoints
} as const satisfies Record<string, Options>

// ─── In-memory fallback ────────────────────────────────────────────────────────

const memCounters = new Map<string, { count: number; resetAt: number }>()

function memIncr(key: string, windowSeconds: number): { count: number; resetAt: number } {
  const now = Date.now()
  const cur = memCounters.get(key)
  if (!cur || now >= cur.resetAt) {
    const entry = { count: 1, resetAt: now + windowSeconds * 1000 }
    memCounters.set(key, entry)
    // Opportunistic GC so the map can't grow unbounded.
    if (memCounters.size > 10_000) {
      for (const [k, v] of memCounters) if (now >= v.resetAt) memCounters.delete(k)
    }
    return entry
  }
  cur.count++
  return cur
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function clientIp(request: Request): string {
  // First hop of x-forwarded-for is the client when set by a trusted proxy
  // (Vercel / ALB). Falls back to a shared bucket when absent (local dev).
  const xff = request.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Returns a ready 429 Response when over limit, or null to proceed.
 * @param bucket logical name, e.g. 'login' — combined with IP for the key
 */
export async function rateLimit(
  request: Request,
  bucket: keyof typeof LIMITS | string,
  opts?: Options,
): Promise<Response | null> {
  const { limit, windowSeconds } =
    opts ?? LIMITS[bucket as keyof typeof LIMITS] ?? LIMITS.expensive
  const key = `rl:${bucket}:${clientIp(request)}`

  let count: number
  let resetAt: number

  const client = getRedis()
  if (client) {
    try {
      const results = await client
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .pttl(key)
        .exec()
      count = (results?.[0]?.[1] as number) ?? 1
      const pttl = (results?.[2]?.[1] as number) ?? windowSeconds * 1000
      resetAt = Date.now() + Math.max(pttl, 0)
    } catch {
      return null // fail open on Redis errors
    }
  } else {
    const entry = memIncr(key, windowSeconds)
    count = entry.count
    resetAt = entry.resetAt
  }

  if (count <= limit) return null

  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return Response.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}
