/**
 * Startup environment validation (fail fast, not on first request).
 *
 * Invoked once from `src/instrumentation.ts` when the server boots. In
 * production a missing/weak required variable throws and stops the deploy from
 * serving traffic; in development we log a warning and continue so the app
 * still runs in demo mode without keys.
 *
 * Per-use guards (e.g. crypto.ts, auth.ts) remain as defense in depth.
 */

type Check = { name: string; ok: (v: string | undefined) => boolean; hint: string }

const REQUIRED_IN_PROD: Check[] = [
  {
    name: 'DATABASE_URL',
    ok: (v) => !!v && /^postgres(ql)?:\/\//.test(v),
    hint: 'Postgres connection string (postgresql://…)',
  },
  {
    name: 'JWT_SECRET',
    ok: (v) => !!v && v.length >= 32,
    hint: 'random string, at least 32 chars (openssl rand -hex 32)',
  },
  {
    name: 'TOKEN_ENCRYPTION_KEY',
    ok: (v) => !!v && (v.length === 64 || v.length === 44), // 32 bytes as hex or base64
    hint: '32-byte key, hex (64 chars) or base64 (openssl rand -hex 32)',
  },
]

// Vars that only make sense together. If some of a group are set and others
// are missing, the integration silently half-works — warn loudly instead.
const GROUPS: Record<string, string[]> = {
  plaid: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
  quickbooks: ['QB_CLIENT_ID', 'QB_CLIENT_SECRET'],
  xero: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'],
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
}

export function validateEnv(): void {
  // `next build` boots server instances to prerender pages, which invokes
  // instrumentation with NODE_ENV=production — but build environments (CI,
  // Vercel build step) legitimately use stub secrets. Only enforce when the
  // process will actually serve traffic.
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const isProd = process.env.NODE_ENV === 'production'
  const errors: string[] = []
  const warnings: string[] = []

  for (const c of REQUIRED_IN_PROD) {
    if (!c.ok(process.env[c.name])) {
      errors.push(`${c.name} — expected: ${c.hint}`)
    }
  }

  for (const [group, vars] of Object.entries(GROUPS)) {
    const set = vars.filter((v) => !!process.env[v])
    if (set.length > 0 && set.length < vars.length) {
      const missing = vars.filter((v) => !process.env[v]).join(', ')
      warnings.push(`${group}: partially configured — missing ${missing}`)
    }
  }

  for (const w of warnings) console.warn(`[env] warning: ${w}`)

  if (errors.length > 0) {
    const msg = `[env] invalid configuration:\n  - ${errors.join('\n  - ')}`
    if (isProd) throw new Error(msg)
    console.warn(`${msg}\n[env] continuing in development (demo mode)`)
  }
}
