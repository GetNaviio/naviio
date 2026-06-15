import type { ForecastPoint, ForecastResult, ForecastSummary, ForecastScenario } from '@/types'
import { deriveDrivers, projectDriverSeries, newMrrSeriesFrom, type MrrDrivers } from '@/lib/forecasting/drivers'
import { projectOpexSeries, startOtherOpex as splitOtherOpex } from '@/lib/forecasting/opex'
import {
  deriveRetentionCurve,
  tiltCurve,
  projectCohortSeriesWithExpansion,
  hasSufficientCohortData,
  type CohortSeries,
} from '@/lib/forecasting/cohorts'
import type { Waterfall } from '@/lib/metrics/mrr'

// ─── Neutral defaults (NO mock data) ──────────────────────────────────────────
// When a live anchor is absent the projection uses a neutral DEFAULT, never a
// fabricated figure: 0 for amounts, mild assumptions for rates. With no real
// inputs the forecast is all zeros and the page shows an empty/connect state —
// the engine never emits demo numbers.

const DEFAULT_MONTHLY_GROWTH = 0.03  // neutral MoM MRR growth assumption
const DEFAULT_OPEX_GROWTH    = 0     // flat opex unless a live rate says otherwise
const DEFAULT_REVENUE_TO_MRR = 1     // recurring-only unless a real ratio is given

/** Default month-over-month MRR growth assumption (overridden by a live rate). */
export function baseMonthlyGrowthRate(): number { return DEFAULT_MONTHLY_GROWTH }

/** Default opex growth assumption (overridden by a live rate). */
export function baseOpexGrowthRate(): number { return DEFAULT_OPEX_GROWTH }

/** Default monthly churn assumption (overridden by a live churn rate). */
export const BASE_CHURN_RATE = 0.03

// ─── Month label generation ───────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Generate labels starting at June 2026 */
function forecastMonthLabels(count: number): string[] {
  const labels: string[] = []
  let month = 5  // June = 5
  let year  = 2026
  for (let i = 0; i < count; i++) {
    labels.push(`${MONTH_NAMES[month]} '${String(year).slice(2)}`)
    month++
    if (month === 12) { month = 0; year++ }
  }
  return labels
}

// ─── Core projection ─────────────────────────────────────────────────────────

interface ProjectionOpts {
  growthMultiplier:     number   // 0.5 bear · 1.0 base · 1.5 bull
  churnMultiplier:      number
  opexGrowthMultiplier: number
  horizonMonths:        number
  customGrowthRate?:    number   // override base growth rate (decimal, e.g. 0.04)
  customChurnRate?:     number   // override base churn rate (decimal, e.g. 0.03)
  startMrr?:            number   // live anchor — current MRR
  startCash?:           number   // live anchor — current cash balance
  startOpex?:           number   // live anchor — current monthly opex
  revenueToMrr?:        number   // live anchor — revenue ÷ MRR ratio (1 = recurring only)
  opexGrowthRate?:      number   // live anchor — monthly opex growth (decimal)
  drivers?:             MrrDrivers // driver-based MRR path (overrides simple net compounding)
  cohortMrrSeries?:     number[]   // cohort-decay MRR path (highest fidelity; overrides drivers)
  // Opex-driver path: when present, opex = other-opex (compounded) + S&M derived
  // from this scenario's new-logo MRR via CAC ÷ ARPU. Otherwise opex keeps the
  // flat (1 + opexG) compounding below.
  opexDrivers?: ProjectionOpexDrivers
}

/** Per-scenario opex-driver inputs (already tilted) for `projectScenario`. */
interface ProjectionOpexDrivers {
  cac:            number
  arpu:           number
  marketingSpend: number   // current monthly S&M, carved out of startOpex
  newMrrSeries:   number[] // this scenario's per-month new-logo MRR (tilted)
}

interface ProjectionSeries {
  mrr:         number[]
  revenue:     number[]
  opex:        number[]
  cashBalance: number[]
}

function projectScenario(opts: ProjectionOpts): ProjectionSeries {
  const growth = (opts.customGrowthRate ?? DEFAULT_MONTHLY_GROWTH) * opts.growthMultiplier
  const churn  = (opts.customChurnRate  ?? BASE_CHURN_RATE)        * opts.churnMultiplier
  const opexG  = (opts.opexGrowthRate   ?? DEFAULT_OPEX_GROWTH)    * opts.opexGrowthMultiplier
  const rtm    = opts.revenueToMrr      ?? DEFAULT_REVENUE_TO_MRR

  const net = growth - churn

  const mrr:         number[] = []
  const revenue:     number[] = []
  const opex:        number[] = []
  const cashBalance: number[] = []

  const startMrr  = opts.startMrr ?? 0
  const startOpex = opts.startOpex ?? 0
  let curMrr     = startMrr
  let curOpex    = startOpex
  let curCash    = opts.startCash ?? 0

  // Opex fidelity ladder:
  //   1. driver-based — OTHER opex (payroll/G&A/infra) compounds at opexG, and
  //      S&M is rebuilt from this scenario's new-logo MRR × CAC ÷ ARPU, so the
  //      cost of acquisition tracks the growth the projection assumes;
  //   2. flat — every dollar of opex compounds at (1 + opexG) (today's behavior).
  // The driver path carves current marketing spend out of the starting opex so
  // S&M isn't double-counted, then layers the projected S&M back on per month.
  const opexSeries = opts.opexDrivers
    ? projectOpexSeries({
        startOtherOpex:      splitOtherOpex(startOpex, opts.opexDrivers.marketingSpend),
        otherOpexGrowthRate: opexG,
        cac:                 opts.opexDrivers.cac,
        arpu:                opts.opexDrivers.arpu,
        newMrrSeries:        opts.opexDrivers.newMrrSeries,
        horizon:             opts.horizonMonths,
      })
    : null

  // MRR series fidelity ladder:
  //   1. cohort-decay (existing base aged on real per-cohort retention curves +
  //      new cohorts decaying on the same curve) — highest fidelity;
  //   2. flat drivers (pass-1 new/expansion/contraction/churn split);
  //   3. single-rate net compounding (no real data).
  const mrrSeries = opts.cohortMrrSeries
    ? opts.cohortMrrSeries
    : opts.drivers
      ? projectDriverSeries(startMrr, opts.drivers, opts.horizonMonths)
      : null

  for (let i = 0; i < opts.horizonMonths; i++) {
    curMrr  = mrrSeries ? mrrSeries[i] : curMrr * (1 + net)
    curOpex = opexSeries ? opexSeries[i] : curOpex * (1 + opexG)
    const curRevenue = curMrr * rtm
    const netCashFlow = curRevenue - curOpex
    curCash = curCash + netCashFlow

    mrr.push(Math.round(curMrr))
    revenue.push(Math.round(curRevenue))
    opex.push(Math.round(curOpex))
    cashBalance.push(Math.round(curCash))
  }
  return { mrr, revenue, opex, cashBalance }
}

function buildSummary(series: ProjectionSeries, opex: number[]): ForecastSummary {
  const finalMrr  = series.mrr[series.mrr.length - 1]
  const finalCash = series.cashBalance[series.cashBalance.length - 1]
  const finalOpex = opex[opex.length - 1]
  const monthlyBurn = Math.max(finalOpex - series.revenue[series.revenue.length - 1], 0)

  return {
    mrr:              finalMrr,
    arr:              finalMrr * 12,
    runway:           monthlyBurn > 0 ? Math.round(finalCash / monthlyBurn) : 99,
    cashBalance:      finalCash,
    cumulativeRevenue: series.revenue.reduce((a, b) => a + b, 0),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Live anchors so the projection starts from the customer's real numbers. */
export interface ForecastAnchor {
  startMrr?: number
  startCash?: number
  startOpex?: number
  revenueToMrr?: number
  opexGrowthRate?: number
  live?: boolean   // when true, omit the mock historical series
  /**
   * Real last-period MRR movement. When present, the MRR projection is
   * driver-based (new / expansion / contraction / churn derived from this
   * waterfall) instead of single-rate net compounding. `startMrr` should be the
   * current MRR; the waterfall's startMrr is only used to compute the rates.
   */
  drivers?: Waterfall
  /** Assumed month-over-month growth in new-logo MRR (fraction). Default 0. */
  newMrrGrowthRate?: number
  /**
   * Real per-cohort retention (from `cohortRetention` via /api/revenue/movement).
   * When there is enough signal (≥1 cohort with an offset≥1 point), the existing
   * base is aged forward on an empirical retention curve and new MRR is layered
   * on as fresh decaying cohorts — higher fidelity than the flat-driver path.
   * Falls back to `drivers`, then to simple compounding, when absent/insufficient.
   */
  cohorts?: CohortSeries[]
  /**
   * Unit-economics inputs for **driver-based opex**. When present (and a real
   * waterfall is available to seed the new-MRR stream), projected opex is split
   * into OTHER opex (payroll/G&A/infra, compounding at the base opex growth rate)
   * plus S&M DRIVEN by each month's projected new logos × CAC, where new logos =
   * that month's new-logo MRR ÷ ARPU. Absent this, opex keeps today's flat
   * (1 + opexGrowthRate) compounding. `cac` and `arpu` come from the live metrics
   * (marketing ÷ new customers, MRR ÷ customers); `currentMarketingSpend` is this
   * month's S&M, carved out of `startOpex` so it isn't double-counted.
   */
  opexDrivers?: {
    cac: number
    arpu: number
    currentMarketingSpend: number
  }
}

// Scenario tilts for the driver path — mirror the simple-path multipliers so
// bear / base / bull keep their meaning regardless of which path runs.
const DRIVER_TILTS = {
  bear: { growthMultiplier: 0.5, churnMultiplier: 1.3 },
  base: { growthMultiplier: 1.0, churnMultiplier: 1.0 },
  bull: { growthMultiplier: 1.5, churnMultiplier: 0.7 },
} as const

export function generateForecast(
  horizonMonths: number = 12,
  customGrowthRate?: number,
  customChurnRate?:  number,
  anchor: ForecastAnchor = {},
): ForecastResult {
  const baseGrowth = customGrowthRate ?? baseMonthlyGrowthRate()
  const baseChurn  = customChurnRate  ?? BASE_CHURN_RATE
  const { startMrr, startCash, startOpex, revenueToMrr, opexGrowthRate } = anchor
  const extra = { startMrr, startCash, startOpex, revenueToMrr, opexGrowthRate, customGrowthRate: baseGrowth, customChurnRate: baseChurn }

  // Driver-based path: when a real waterfall is provided, derive per-scenario
  // drivers (new/expansion/contraction/churn) from the customer's actual last-
  // period movement. Otherwise drivers are undefined and projectScenario falls
  // back to single-rate net compounding.
  const newMrrG = anchor.newMrrGrowthRate ?? 0
  const driversFor = (s: keyof typeof DRIVER_TILTS): MrrDrivers | undefined =>
    anchor.drivers ? deriveDrivers(anchor.drivers, DRIVER_TILTS[s], newMrrG) : undefined

  // Cohort-decay path (highest fidelity): age the existing base on a real
  // retention curve and add new MRR as fresh decaying cohorts. Active only when
  // the cohort table has enough signal AND we have a waterfall to seed new-MRR /
  // expansion from. Churn + contraction come FROM the curve; expansion is layered
  // on the retained base as a separate rate so it is not double-counted with the
  // loss the curve already nets out.
  const cohortActive =
    !!anchor.cohorts && hasSufficientCohortData(anchor.cohorts) && !!anchor.drivers
  const baseCurve = cohortActive ? deriveRetentionCurve(anchor.cohorts!) : null
  const cohortSeriesFor = (s: keyof typeof DRIVER_TILTS): number[] | undefined => {
    if (!cohortActive || !baseCurve) return undefined
    const tilt = DRIVER_TILTS[s]
    const d = deriveDrivers(anchor.drivers!, tilt, newMrrG)
    // Tilt the curve's per-step loss by churnMultiplier (bear loses more, bull
    // less) so scenarios move retention consistently with the flat path.
    const curve = tiltCurve(baseCurve, tilt.churnMultiplier)
    return projectCohortSeriesWithExpansion(
      anchor.cohorts!,
      d.newMrr,
      newMrrG,
      d.expansionRate,
      curve,
      horizonMonths,
    )
  }

  // Driver-based opex (unit-economics-constrained growth): tie S&M to the new
  // logos each scenario adds. Active only when we have CAC + ARPU AND a real
  // waterfall to seed the new-MRR stream (otherwise opex keeps flat compounding).
  // The new-MRR stream per scenario comes from the SAME tilted drivers the MRR
  // path uses (newMrr tilted by growthMultiplier), so MRR growth and the S&M that
  // funds it always agree — one source of truth. Bear pays MORE per logo (CAC is
  // tilted up by the loss multiplier: weaker funnel = higher acquisition cost);
  // bull pays less.
  const od = anchor.opexDrivers
  const opexDriversFor = (s: keyof typeof DRIVER_TILTS): ProjectionOpexDrivers | undefined => {
    if (!od || od.cac <= 0 || od.arpu <= 0 || !anchor.drivers) return undefined
    const d = deriveDrivers(anchor.drivers, DRIVER_TILTS[s], newMrrG)
    return {
      cac:            od.cac * DRIVER_TILTS[s].churnMultiplier,
      arpu:           od.arpu,
      marketingSpend: od.currentMarketingSpend,
      newMrrSeries:   newMrrSeriesFrom(d.newMrr, newMrrG, horizonMonths),
    }
  }

  const bear = projectScenario({ growthMultiplier: 0.5, churnMultiplier: 1.3, opexGrowthMultiplier: 1.2, horizonMonths, ...extra, drivers: driversFor('bear'), cohortMrrSeries: cohortSeriesFor('bear'), opexDrivers: opexDriversFor('bear') })
  const base = projectScenario({ growthMultiplier: 1.0, churnMultiplier: 1.0, opexGrowthMultiplier: 1.0, horizonMonths, ...extra, drivers: driversFor('base'), cohortMrrSeries: cohortSeriesFor('base'), opexDrivers: opexDriversFor('base') })
  const bull = projectScenario({ growthMultiplier: 1.5, churnMultiplier: 0.7, opexGrowthMultiplier: 0.8, horizonMonths, ...extra, drivers: driversFor('bull'), cohortMrrSeries: cohortSeriesFor('bull'), opexDrivers: opexDriversFor('bull') })

  const forecastLabels = forecastMonthLabels(horizonMonths)

  // Forward projection only — the engine never emits a historical series (that
  // used to come from mock data). Real history, when shown, is supplied by the
  // page from live metrics.
  const data: ForecastPoint[] = [
    ...forecastLabels.map((month, i) => ({
      month,
      historicalMrr:     null,
      historicalRevenue: null,
      bear:         bear.mrr[i],
      base:         base.mrr[i],
      bull:         bull.mrr[i],
      confidence:   bull.mrr[i] - bear.mrr[i],
      isHistorical: false,
    })),
  ]

  return {
    data,
    summary: {
      bear: buildSummary(bear, bear.opex),
      base: buildSummary(base, base.opex),
      bull: buildSummary(bull, bull.opex),
    },
    assumptions: {
      baseMonthlyGrowthRate: baseGrowth,
      baseChurnRate:         baseChurn,
      baseOpexGrowthRate:    baseOpexGrowthRate(),
    },
    horizonMonths,
  }
}

export function generateRunwayForecast(_orgId?: string) {
  const result = generateForecast(12)
  return {
    bear: result.summary.bear.runway,
    base: result.summary.base.runway,
    bull: result.summary.bull.runway,
  }
}

// ─── Predefined scenarios ─────────────────────────────────────────────────────

export const DEFAULT_SCENARIOS: ForecastScenario[] = [
  {
    id: 'bear',
    name: 'Bear Case',
    type: 'bear',
    assumptions: { growthMultiplier: 0.5, churnMultiplier: 1.3, opexGrowthMultiplier: 1.2 },
  },
  {
    id: 'base',
    name: 'Base Case',
    type: 'base',
    assumptions: { growthMultiplier: 1.0, churnMultiplier: 1.0, opexGrowthMultiplier: 1.0 },
  },
  {
    id: 'bull',
    name: 'Bull Case',
    type: 'bull',
    assumptions: { growthMultiplier: 1.5, churnMultiplier: 0.7, opexGrowthMultiplier: 0.8 },
  },
]

// Custom scenarios are persisted per-org in the ForecastScenario table — see
// /api/forecast/scenarios. Only the built-in cases live in code.

export function compareScenarios(scenarioIds: string[], custom: ForecastScenario[] = []) {
  const all = [...DEFAULT_SCENARIOS, ...custom]
  return scenarioIds.map((id) => {
    const s = all.find((x) => x.id === id)
    if (!s) return null
    const result = generateForecast(12)
    const key = s.type === 'bear' ? 'bear' : s.type === 'bull' ? 'bull' : 'base'
    return { scenario: s, summary: result.summary[key as keyof typeof result.summary] }
  }).filter(Boolean)
}
