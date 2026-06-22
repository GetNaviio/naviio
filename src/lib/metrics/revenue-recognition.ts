/**
 * Ratable revenue recognition (deferred revenue).
 *
 * A subscription charged annually (or quarterly) is cash received up front, but
 * the revenue is EARNED over the service period. Booking the whole amount on the
 * charge date spikes that month's income and contradicts MRR. Instead we spread a
 * charge that carries a multi-month service window straight-line across the
 * calendar months it covers; the not-yet-earned portion is deferred revenue (a
 * liability).
 *
 * Scope is deliberately narrow: ONLY revenue rows (CREDIT) that carry a
 * recognition window longer than ~1 month are spread. Monthly plans, one-time
 * charges, and every expense pass through unchanged — so the blast radius is
 * limited to genuinely multi-period subscriptions.
 *
 * Pure + side-effect free for unit testing.
 */
import type { DatedLedgerTxn } from './compute'

const DAY = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100
const toMs = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).getTime()
const firstOfNextMonthUTC = (ms: number) => {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

/** A revenue row with a service window spanning clearly more than one month. */
function shouldSpread(t: DatedLedgerTxn): boolean {
  if (t.type !== 'CREDIT') return false
  if (!t.recognitionStart || !t.recognitionEnd) return false
  return toMs(t.recognitionEnd) - toMs(t.recognitionStart) > 45 * DAY
}

/**
 * Replace each multi-month revenue charge with one slice per calendar month it
 * covers (straight-line by days in each month). The last slice absorbs the
 * rounding remainder so slices sum exactly to the original amount. Slices are
 * dated to the 15th (UTC) of their month so they bucket into that month, and the
 * externalId gets a `~rec~YYYY-MM` suffix so they're traceable and idempotent.
 * All other rows pass through untouched.
 */
export function expandRevenueRecognition<T extends DatedLedgerTxn>(txns: T[]): T[] {
  const out: T[] = []
  for (const t of txns) {
    if (!shouldSpread(t)) {
      out.push(t)
      continue
    }
    const s = toMs(t.recognitionStart!)
    const e = toMs(t.recognitionEnd!)
    const totalDays = (e - s) / DAY

    const slices: { ms: number; days: number }[] = []
    let cur = s
    while (cur < e) {
      const monthEnd = Math.min(firstOfNextMonthUTC(cur), e)
      slices.push({ ms: cur, days: (monthEnd - cur) / DAY })
      cur = monthEnd
    }

    let allocated = 0
    slices.forEach((sl, i) => {
      const last = i === slices.length - 1
      const amount = last ? round2(t.amount - allocated) : round2((t.amount * sl.days) / totalDays)
      allocated += amount
      const d = new Date(sl.ms)
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      out.push({
        ...t,
        amount,
        date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15)),
        externalId: t.externalId ? `${t.externalId}~rec~${ym}` : undefined,
      } as T)
    })
  }
  return out
}

/**
 * Deferred-revenue balance as of `asOf`: the sum of the not-yet-earned portion of
 * every multi-month revenue charge (cash already collected, service not yet
 * delivered). Straight-line by time within each charge's window.
 */
export function deferredRevenueAsOf(txns: DatedLedgerTxn[], asOf: Date): number {
  const a = asOf.getTime()
  let deferred = 0
  for (const t of txns) {
    if (!shouldSpread(t)) continue
    const s = toMs(t.recognitionStart!)
    const e = toMs(t.recognitionEnd!)
    if (e <= a) continue // fully earned
    if (s >= a) {
      deferred += t.amount // not started — entirely deferred
      continue
    }
    deferred += (t.amount * (e - a)) / (e - s) // partially earned
  }
  return round2(deferred)
}
