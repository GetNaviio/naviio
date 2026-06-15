/**
 * Driver-based opex projection (pure, side-effect-free, unit-tested).
 *
 * FP&A principle: **unit-economics-constrained growth**. A forecast must not
 * assume growth the acquisition spend can't fund. Sales & marketing (S&M) is not
 * a flat percentage of opex — it is the *cost of the new logos the projection
 * adds*. So we split projected opex into two streams:
 *
 *   1. OTHER opex (payroll / G&A / infra) — grows at the base opex growth rate
 *      (today's behavior): otherOpex[t] = startOtherOpex × (1 + otherGrowth)^t.
 *   2. S&M spend — DRIVEN by that month's projected new logos × CAC, where
 *      projected new logos = that month's NEW-logo MRR ÷ ARPU:
 *      sAndM[t] = (newMrr[t] / ARPU) × CAC.
 *
 *   opex[t] = otherOpex[t] + sAndM[t]
 *
 * This closes the loop with the MRR drivers: the same new-MRR stream that grows
 * revenue now also funds the cost of acquiring it. Tilt the MRR drivers (bear /
 * bull) and S&M moves with them automatically, because new MRR is tilted.
 */

// ─── Inputs ────────────────────────────────────────────────────────────────────

export interface OpexSeriesInput {
  /** Current monthly OTHER opex (total opex minus current marketing spend). */
  startOtherOpex: number
  /** Month-over-month growth applied to OTHER opex (fraction, e.g. 0.03). */
  otherOpexGrowthRate: number
  /** Customer acquisition cost — marketing spend ÷ new customers ($/logo). */
  cac: number
  /** Average revenue per account — used to convert new MRR → new logos. */
  arpu: number
  /** Per-month NEW-logo MRR added (NOT total MRR). Length should be ≥ horizon. */
  newMrrSeries: number[]
  /** Number of forecast months to produce. */
  horizon: number
}

// ─── Split current opex into other vs S&M ──────────────────────────────────────

/**
 * Split the current total monthly opex into the OTHER-opex base used by the
 * projection. S&M is rebuilt forward from new logos × CAC, so we carve current
 * marketing spend OUT of the starting opex to avoid double-counting it. Floored
 * at 0 (marketing spend can momentarily exceed total opex in a thin month).
 */
export function startOtherOpex(startOpex: number, currentMarketingSpend: number): number {
  return Math.max(startOpex - currentMarketingSpend, 0)
}

// ─── Project the opex series ────────────────────────────────────────────────────

/**
 * Project monthly opex where OTHER opex compounds and S&M is derived from each
 * month's new-logo MRR via CAC and ARPU.
 *
 *   otherOpex[t] = startOtherOpex × (1 + otherOpexGrowthRate)^t   (t = 0..horizon-1)
 *   newLogos[t]  = newMrrSeries[t] / ARPU
 *   sAndM[t]     = newLogos[t] × CAC
 *   opex[t]      = otherOpex[t] + sAndM[t]
 *
 * Divide-by-zero guard: ARPU ≤ 0 means we cannot convert new MRR into a logo
 * count, so the acquisition cost of new MRR is not derivable. In that case S&M
 * contributes **0 incremental** opex and the series falls back to pure OTHER-opex
 * growth. CAC ≤ 0 likewise yields no S&M (no cost per logo). Negative new MRR in
 * a month (net contraction stored as new) is floored to 0 logos — you don't earn
 * negative acquisition spend.
 *
 * Pure: no rounding side-effects on the inputs; each month is rounded to whole
 * dollars on output to match the rest of the engine series.
 */
export function projectOpexSeries(input: OpexSeriesInput): number[] {
  const { startOtherOpex: start, otherOpexGrowthRate, cac, arpu, newMrrSeries, horizon } = input

  // S&M is only derivable when ARPU and CAC are both positive. Otherwise S&M is
  // 0 incremental and opex is pure other-opex growth (documented fallback).
  const canDeriveSAndM = arpu > 0 && cac > 0

  const out: number[] = []
  for (let t = 0; t < horizon; t++) {
    const otherOpex = start * Math.pow(1 + otherOpexGrowthRate, t)
    let sAndM = 0
    if (canDeriveSAndM) {
      const newMrr = newMrrSeries[t] ?? 0
      const newLogos = newMrr > 0 ? newMrr / arpu : 0
      sAndM = newLogos * cac
    }
    out.push(Math.round(otherOpex + sAndM))
  }
  return out
}
