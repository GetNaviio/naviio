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

// ── Per-industry benchmark targets ──────────────────────────────────────────
// A "healthy" gross/net margin varies enormously by industry — 30% gross margin
// is great for a manufacturer and alarming for SaaS. We grade each business on
// its own curve, built parametrically around an industry target (the value that
// scores ~82–85). Sources: standard FP&A benchmarks + the fractional-CFO playbook
// (docs/intelligence/fractional-cfo-industry-playbook.md).
import type { Industry } from './industry'

export const GROSS_MARGIN_TARGET: Record<Industry, number> = {
  saas: 80, ecommerce: 45, restaurant: 68, agency: 55, proservices: 55, trades: 38,
  manufacturing: 30, healthcare: 55, realestate: 65, nonprofit: 60, generic: 45,
}
export const NET_MARGIN_TARGET: Record<Industry, number> = {
  saas: 15, ecommerce: 10, restaurant: 10, agency: 20, proservices: 22, trades: 12,
  manufacturing: 10, healthcare: 18, realestate: 25, nonprofit: 3, generic: 10,
}
// Healthy MONTH-over-month revenue growth % — a SaaS startup is expected to grow
// far faster than a mature restaurant or property portfolio.
export const REVENUE_GROWTH_TARGET: Record<Industry, number> = {
  saas: 7, ecommerce: 4, restaurant: 1.5, agency: 2.5, proservices: 2.5, trades: 1.5,
  manufacturing: 1.5, healthcare: 1.5, realestate: 1, nonprofit: 1, generic: 2,
}
// Healthy months-of-cash (runway) — a burning growth startup wants a long runway;
// a profitable, predictable business runs comfortably on far less.
export const MONTHS_OF_CASH_TARGET: Record<Industry, number> = {
  saas: 18, ecommerce: 6, restaurant: 4, agency: 4, proservices: 4, trades: 6,
  manufacturing: 6, healthcare: 4, realestate: 6, nonprofit: 6, generic: 6,
}

const targetOf = (t: Record<Industry, number>, industry?: Industry | null) =>
  t[industry ?? 'generic'] ?? t.generic

/** Gross-margin band scaled to an industry target (always-positive metric). */
const grossBand = (t: number): [number, number][] =>
  [[t * 0.25, 20], [t * 0.55, 45], [t * 0.8, 65], [t, 85], [t * 1.25, 96]]
/** Net-margin band scaled to a target, tolerant of break-even / small losses. */
const netBand = (t: number): [number, number][] =>
  [[-t, 12], [0, 42], [t * 0.5, 60], [t, 82], [t * 1.6, 96]]
/** Revenue-growth band scaled to a target, tolerant of flat / declining months. */
const growthBand = (t: number): [number, number][] =>
  [[-t, 18], [0, 45], [t * 0.4, 62], [t, 82], [t * 2, 96]]
/** Months-of-cash band scaled to a target (more is better, saturating). */
const cashBand = (t: number): [number, number][] =>
  [[t * 0.25, 25], [t * 0.5, 45], [t, 75], [t * 1.5, 90], [t * 2, 96]]

/** Profitability ← net margin %, graded against the org's industry target. */
export const scoreProfitability = (netMarginPct: number | null | undefined, industry?: Industry | null) =>
  opt(netMarginPct, (v) => band(v, netBand(targetOf(NET_MARGIN_TARGET, industry))))

/** Growth ← month-over-month MRR growth % (SaaS pace). */
export const scoreGrowth = (momGrowthPct: number | null | undefined) =>
  opt(momGrowthPct, (v) => band(v, [[-5, 20], [0, 45], [3, 65], [7, 82], [15, 97]]))

/** Growth (universal) ← month-over-month REVENUE growth %, graded against the
 *  industry's growth target (SaaS is expected to grow far faster than a
 *  restaurant). */
export const scoreRevenueGrowth = (momGrowthPct: number | null | undefined, industry?: Industry | null) =>
  opt(momGrowthPct, (v) => band(v, growthBand(targetOf(REVENUE_GROWTH_TARGET, industry))))

/** Unit economics (universal) ← gross margin %, graded against the org's industry
 *  target (30% is excellent for manufacturing, weak for SaaS). */
export const scoreGrossMargin = (grossMarginPct: number | null | undefined, industry?: Industry | null) =>
  opt(grossMarginPct, (v) => band(v, grossBand(targetOf(GROSS_MARGIN_TARGET, industry))))

/** Retention ← NRR %. */
export const scoreRetention = (nrrPct: number | null | undefined) =>
  opt(nrrPct, (v) => band(v, [[80, 30], [90, 50], [100, 70], [110, 85], [130, 98]]))

/** Unit economics ← LTV/CAC ratio. */
export const scoreUnitEconomics = (ltvCac: number | null | undefined) =>
  opt(ltvCac, (v) => band(v, [[1, 25], [3, 60], [5, 80], [8, 92], [12, 98]]))

/** Efficiency ← Magic Number (net-new ARR per $ of S&M). */
export const scoreEfficiency = (magic: number | null | undefined) =>
  opt(magic, (v) => band(v, [[0.3, 30], [0.7, 55], [1.0, 72], [1.5, 88], [2.5, 97]]))

/** Liquidity ← months of cash, graded against the industry's runway target
 *  (a burning startup needs ~18mo; a profitable restaurant is fine on 3–6).
 *  Infinity ⇒ cash-positive ⇒ strong. */
export function scoreLiquidity(runwayMonths: number | null | undefined, industry?: Industry | null): number | null {
  if (runwayMonths == null || Number.isNaN(runwayMonths)) return null
  if (!Number.isFinite(runwayMonths)) return 95
  return band(runwayMonths, cashBand(targetOf(MONTHS_OF_CASH_TARGET, industry)))
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
