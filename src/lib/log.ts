/**
 * Structured logger — zero dependencies, JSON lines to stdout/stderr.
 *
 * Why: Vercel log drains (Axiom, Logtail, Datadog) index JSON fields, so
 * `log.error('sync_failed', { orgId, provider })` becomes queryable
 * (`event:sync_failed provider:XERO`) instead of an unsearchable prose string.
 * In development it stays human-readable.
 *
 * Use for OPS-CRITICAL events (money reconciliation, sync failures, auth
 * anomalies). Plain console.* remains fine for incidental debugging.
 *
 * If/when a vendor SDK (e.g. pino, Sentry) is adopted, this module is the only
 * seam to change.
 */

type Fields = Record<string, unknown>

const isProd = process.env.NODE_ENV === 'production'

function emit(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}): void {
  if (isProd) {
    const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    // eslint-disable-next-line no-console -- structured info lines are the point of this module
    else console.log(line)
  } else {
    const pretty = Object.entries(fields)
      .map(([k, v]) => `${k}=${v instanceof Error ? v.message : JSON.stringify(v)}`)
      .join(' ')
    const msg = `[${event}] ${pretty}`
    if (level === 'error') console.error(msg)
    else if (level === 'warn') console.warn(msg)
    // eslint-disable-next-line no-console -- dev-readable info output
    else console.log(msg)
  }
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}

/** Normalize unknown catch values for the `err` field. */
export function errField(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}
