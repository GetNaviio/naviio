/**
 * Pure MRR-movement math over subscription snapshots. No DB — callers pass the
 * two periods' per-subscription MRR, so NRR / waterfall / cohorts are
 * deterministic and unit-tested.
 */

export interface SubMrr {
  subscriptionId: string
  /** When present, retention is measured per CUSTOMER (a customer who swaps one
   *  subscription for another nets flat instead of booking churn + new). Falls
   *  back to subscriptionId when absent. */
  customerId?: string | null
  mrr: number
  cohortMonth?: string
}

export interface Waterfall {
  startMrr: number
  newMrr: number
  expansionMrr: number
  contractionMrr: number
  churnedMrr: number
  endMrr: number
  netNewMrr: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: SubMrr[]) => xs.reduce((s, x) => s + x.mrr, 0)

/** Group rows by customer (or subscription when no customerId), summing MRR — so
 *  movement is classified per CUSTOMER, the correct unit for NRR. */
function aggregateByCustomer(rows: SubMrr[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of rows) {
    const key = s.customerId ?? s.subscriptionId
    m.set(key, (m.get(key) ?? 0) + s.mrr)
  }
  return m
}

/**
 * Decompose the change in MRR between two periods into new / expansion /
 * contraction / churned, matching by CUSTOMER across the periods (so a customer
 * who downgrades one sub and adds another nets out instead of double-booking).
 */
export function mrrWaterfall(prev: SubMrr[], curr: SubMrr[]): Waterfall {
  const prevMap = aggregateByCustomer(prev)
  const currMap = aggregateByCustomer(curr)

  let newMrr = 0, expansionMrr = 0, contractionMrr = 0, churnedMrr = 0
  for (const [id, m] of currMap) {
    const p = prevMap.get(id)
    if (p === undefined) newMrr += m
    else if (m > p) expansionMrr += m - p
    else if (m < p) contractionMrr += p - m
  }
  for (const [id, p] of prevMap) {
    if (!currMap.has(id)) churnedMrr += p
  }

  const startMrr = sum(prev)
  const endMrr = sum(curr)
  return {
    startMrr: round2(startMrr),
    newMrr: round2(newMrr),
    expansionMrr: round2(expansionMrr),
    contractionMrr: round2(contractionMrr),
    churnedMrr: round2(churnedMrr),
    endMrr: round2(endMrr),
    netNewMrr: round2(newMrr + expansionMrr - contractionMrr - churnedMrr),
  }
}

/**
 * Net Revenue Retention — MRR retained from EXISTING customers (expansion in,
 * contraction + churn out), excluding new logos. >100% means existing customers
 * alone grow revenue. Null when there's no starting MRR.
 */
export function nrr(w: Waterfall): number | null {
  if (w.startMrr <= 0) return null
  return round2(((w.startMrr + w.expansionMrr - w.contractionMrr - w.churnedMrr) / w.startMrr) * 100)
}

/** Gross Revenue Retention — like NRR but without expansion (≤100%). */
export function grr(w: Waterfall): number | null {
  if (w.startMrr <= 0) return null
  return round2(((w.startMrr - w.contractionMrr - w.churnedMrr) / w.startMrr) * 100)
}

// ─── Cohort retention ─────────────────────────────────────────────────────────

export interface CohortRow {
  period: string         // 'YYYY-MM'
  cohortMonth: string    // 'YYYY-MM'
  mrr: number
}

function monthDiff(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/**
 * Build cohort MRR-retention: for each acquisition cohort, the % of its starting
 * (M0) MRR still present at each later month offset.
 */
export function cohortRetention(rows: CohortRow[]): {
  cohort: string
  base: number
  points: { offset: number; mrr: number; pct: number }[]
}[] {
  // cohort → period → aggregate MRR
  const byCohort = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const periods = byCohort.get(r.cohortMonth) ?? new Map<string, number>()
    periods.set(r.period, (periods.get(r.period) ?? 0) + r.mrr)
    byCohort.set(r.cohortMonth, periods)
  }

  const out: { cohort: string; base: number; points: { offset: number; mrr: number; pct: number }[] }[] = []
  for (const [cohort, periods] of [...byCohort.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const base = periods.get(cohort) ?? 0
    const points = [...periods.entries()]
      .map(([period, mrr]) => ({ offset: monthDiff(cohort, period), mrr: round2(mrr), pct: base > 0 ? round2((mrr / base) * 100) : 0 }))
      .filter((p) => p.offset >= 0)
      .sort((a, b) => a.offset - b.offset)
    out.push({ cohort, base: round2(base), points })
  }
  return out
}
