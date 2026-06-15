/**
 * Navi Score (formerly AirCheck) — the financial-health scoring engine. Each of six dimensions is
 * scored 0–100 from a real metric against SaaS benchmarks; the overall score is
 * a weighted average of whichever dimensions have data. Pure + unit-tested.
 *
 * A dimension returns `null` when its input metric isn't available yet, so the
 * UI shows "needs data" rather than a fabricated score.
 */

/** Piecewise-linear map from a metric value to a 0–100 score. */
export function band(v: number, points: [number, number][]): number {
  if (v <= points[0][0]) return points[0][1]
  const last = points[points.length - 1]
  if (v >= last[0]) return last[1]
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, s0] = points[i]
    const [x1, s1] = points[i + 1]
    if (v >= x0 && v <= x1) return Math.round(s0 + ((s1 - s0) * (v - x0)) / (x1 - x0))
  }
  return last[1]
}

const opt = (v: number | null | undefined, fn: (n: number) => number): number | null =>
  v == null || Number.isNaN(v) ? null : fn(v)

/** Profitability ← net margin %. */
export const scoreProfitability = (netMarginPct: number | null | undefined) =>
  opt(netMarginPct, (v) => band(v, [[-20, 10], [0, 45], [10, 65], [20, 82], [40, 96]]))

/** Growth ← month-over-month MRR growth %. */
export const scoreGrowth = (momGrowthPct: number | null | undefined) =>
  opt(momGrowthPct, (v) => band(v, [[-5, 20], [0, 45], [3, 65], [7, 82], [15, 97]]))

/** Retention ← NRR %. */
export const scoreRetention = (nrrPct: number | null | undefined) =>
  opt(nrrPct, (v) => band(v, [[80, 30], [90, 50], [100, 70], [110, 85], [130, 98]]))

/** Unit economics ← LTV/CAC ratio. */
export const scoreUnitEconomics = (ltvCac: number | null | undefined) =>
  opt(ltvCac, (v) => band(v, [[1, 25], [3, 60], [5, 80], [8, 92], [12, 98]]))

/** Efficiency ← Magic Number (net-new ARR per $ of S&M). */
export const scoreEfficiency = (magic: number | null | undefined) =>
  opt(magic, (v) => band(v, [[0.3, 30], [0.7, 55], [1.0, 72], [1.5, 88], [2.5, 97]]))

/** Liquidity ← runway months (Infinity ⇒ cash-positive ⇒ strong). */
export function scoreLiquidity(runwayMonths: number | null | undefined): number | null {
  if (runwayMonths == null || Number.isNaN(runwayMonths)) return null
  if (!Number.isFinite(runwayMonths)) return 95
  return band(runwayMonths, [[3, 25], [6, 45], [12, 70], [18, 87], [24, 96]])
}

/** Weighted average of the available (non-null) dimension scores. */
export function overallScore(parts: { score: number | null; weight: number }[]): number | null {
  const avail = parts.filter((p) => p.score != null)
  if (avail.length === 0) return null
  const totalW = avail.reduce((s, p) => s + p.weight, 0)
  if (totalW === 0) return null
  return Math.round(avail.reduce((s, p) => s + (p.score as number) * p.weight, 0) / totalW)
}

export function grade(score: number): { grade: string; color: string } {
  if (score >= 93) return { grade: 'A+', color: '#10B981' }
  if (score >= 87) return { grade: 'A', color: '#10B981' }
  if (score >= 83) return { grade: 'A−', color: '#10B981' }
  if (score >= 79) return { grade: 'B+', color: '#3B82F6' }
  if (score >= 75) return { grade: 'B', color: '#3B82F6' }
  if (score >= 71) return { grade: 'B−', color: '#3B82F6' }
  if (score >= 67) return { grade: 'C+', color: '#F59E0B' }
  if (score >= 60) return { grade: 'C', color: '#F59E0B' }
  if (score >= 50) return { grade: 'D', color: '#F97316' }
  return { grade: 'F', color: '#EF4444' }
}

export function scoreColor(score: number): string {
  if (score >= 80) return '#10B981'
  if (score >= 60) return '#F59E0B'
  if (score >= 40) return '#F97316'
  return '#EF4444'
}
