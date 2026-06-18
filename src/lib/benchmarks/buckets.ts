/**
 * Pure helpers for the peer-benchmark histogram. We never store a raw per-org
 * amount — only counts of orgs per coarse spend bucket — so percentiles are
 * estimated from the histogram. Buckets are half-octave (×√2 ≈ 41% wide), which
 * gives a usable median while keeping cohorts coarse.
 */

/** Distinct org count needed before a (vendor, segment) benchmark is shown. */
export const K_ANON = 5

/** Monthly $ → half-octave bucket index (0 for non-positive). */
export function amountToBucket(monthly: number): number {
  if (!(monthly > 0)) return 0
  return Math.round(Math.log2(monthly) * 2)
}

/** Representative $ value at the center of a bucket. */
export function bucketValue(bucket: number): number {
  return Math.round(Math.pow(2, bucket / 2))
}

/** Estimate the p-th percentile ($) from histogram buckets. p in [0,1]. */
export function percentileValue(buckets: { bucket: number; orgs: number }[], p: number): number | null {
  const total = buckets.reduce((s, b) => s + b.orgs, 0)
  if (total === 0) return null
  const sorted = [...buckets].sort((a, b) => a.bucket - b.bucket)
  const target = p * total
  let cum = 0
  for (const b of sorted) {
    cum += b.orgs
    if (cum >= target) return bucketValue(b.bucket)
  }
  return bucketValue(sorted[sorted.length - 1].bucket)
}

// ─── Ratio buckets (category spend ÷ revenue, in %) ─────────────────────────
/** spend÷revenue (a fraction) → 0.5%-resolution bucket index. */
export function ratioToBucket(ratio: number): number {
  if (!(ratio > 0)) return 0
  return Math.round(ratio * 100 * 2) // % × 2 → half-percent buckets
}

/** Representative percent value at a ratio bucket. */
export function ratioBucketPct(bucket: number): number {
  return Math.round((bucket / 2) * 10) / 10
}

/** Estimate the p-th percentile (as a %) from ratio-histogram buckets. */
export function ratioPercentilePct(buckets: { bucket: number; orgs: number }[], p: number): number | null {
  const total = buckets.reduce((s, b) => s + b.orgs, 0)
  if (total === 0) return null
  const sorted = [...buckets].sort((a, b) => a.bucket - b.bucket)
  const target = p * total
  let cum = 0
  for (const b of sorted) { cum += b.orgs; if (cum >= target) return ratioBucketPct(b.bucket) }
  return ratioBucketPct(sorted[sorted.length - 1].bucket)
}

// ─── Size segments ──────────────────────────────────────────────────────────
export const SIZE_BANDS = ['lt_250k', '250k_1m', '1m_5m', '5m_20m', 'gt_20m'] as const
export type SizeBand = (typeof SIZE_BANDS)[number]

const SIZE_LABELS: Record<SizeBand, string> = {
  lt_250k: 'under $250k revenue',
  '250k_1m': '$250k–$1M revenue',
  '1m_5m': '$1M–$5M revenue',
  '5m_20m': '$5M–$20M revenue',
  gt_20m: 'over $20M revenue',
}

/** Coarse size band from annual revenue (keeps cohorts broad / non-identifying). */
export function revenueToSegment(annualRevenue: number): SizeBand {
  if (annualRevenue < 250_000) return 'lt_250k'
  if (annualRevenue < 1_000_000) return '250k_1m'
  if (annualRevenue < 5_000_000) return '1m_5m'
  if (annualRevenue < 20_000_000) return '5m_20m'
  return 'gt_20m'
}

export const segmentLabel = (s: string): string => SIZE_LABELS[s as SizeBand] ?? s
