/**
 * Recurrence + counterparty detection — a vendor-agnostic signal for the
 * categorizer. Payroll, rent, and SaaS subscriptions all share a fingerprint:
 * the SAME counterparty, a REGULAR cadence, and a STABLE amount. Detecting that
 * lets us flag a recurring outflow as a real expense (and prioritize the review
 * queue) even for a merchant we've never seen — no brand keyword required.
 *
 * Pure + side-effect free so the cadence math is unit-tested without a DB.
 */
import { vendorKey, type LedgerTxn } from './classify'

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'irregular'

export interface RecurringStream {
  vendorKey: string
  cadence: Cadence
  count: number
  avgAmount: number
  /** ISO date of the most recent occurrence. */
  lastDate: string
  /** A real, regular cadence (i.e. not 'irregular'). */
  recurring: boolean
}

type DatedTxn = LedgerTxn & { date: string | Date }

const DAY = 86_400_000
const toMs = (d: string | Date): number => (d instanceof Date ? d.getTime() : new Date(d).getTime())
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Bucket a median gap (in days) into a named cadence, with tolerance. */
function cadenceOf(medianGapDays: number): Cadence {
  if (medianGapDays >= 5 && medianGapDays <= 9) return 'weekly'
  if (medianGapDays >= 12 && medianGapDays <= 16) return 'biweekly'
  if (medianGapDays >= 26 && medianGapDays <= 34) return 'monthly'
  if (medianGapDays >= 85 && medianGapDays <= 95) return 'quarterly'
  return 'irregular'
}

/**
 * Find recurring outflow streams. A vendor qualifies when it has ≥3 DEBITs whose
 * median inter-arrival gap matches a known cadence and whose amounts are stable
 * (median absolute deviation within ~25% of the median amount). Returns a
 * vendorKey → stream map; only streams with a real cadence are marked recurring.
 */
export function detectRecurring(txns: DatedTxn[], minOccurrences = 3): Map<string, RecurringStream> {
  const groups = new Map<string, DatedTxn[]>()
  for (const t of txns) {
    if (t.type !== 'DEBIT') continue
    const vk = vendorKey(t)
    if (!vk) continue
    const g = groups.get(vk) ?? []
    g.push(t)
    groups.set(vk, g)
  }

  const out = new Map<string, RecurringStream>()
  for (const [vk, g] of groups) {
    if (g.length < minOccurrences) continue
    const sorted = [...g].sort((a, b) => toMs(a.date) - toMs(b.date))

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push((toMs(sorted[i].date) - toMs(sorted[i - 1].date)) / DAY)
    const medianGap = median(gaps)
    const cadence = cadenceOf(medianGap)

    const amounts = sorted.map((t) => t.amount)
    const medAmt = median(amounts)
    const mad = medAmt > 0 ? median(amounts.map((a) => Math.abs(a - medAmt))) / medAmt : 1
    const stableAmount = mad <= 0.25

    const recurring = cadence !== 'irregular' && stableAmount
    out.set(vk, {
      vendorKey: vk,
      cadence,
      count: sorted.length,
      avgAmount: Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100,
      lastDate: new Date(toMs(sorted[sorted.length - 1].date)).toISOString(),
      recurring,
    })
  }
  return out
}

/** Convenience: the set of vendorKeys that look like a recurring commitment. */
export function recurringVendorKeys(streams: Map<string, RecurringStream>): Set<string> {
  const s = new Set<string>()
  for (const [vk, stream] of streams) if (stream.recurring) s.add(vk)
  return s
}
