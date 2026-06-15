/**
 * Driver-based MRR projection (pure, side-effect-free, unit-tested).
 *
 * FP&A principle: model the *growth engine*, not a single net rate. Each month
 * the existing base retains/expands/contracts/churns at its own driver rates,
 * and NEW-logo MRR is added on top as a separate driver:
 *
 *   nextBase = base * (1 - churnRate - contractionRate + expansionRate) + newMrr
 *
 * The driver rates are derived from the customer's REAL last-period MRR movement
 * (`Waterfall` from src/lib/metrics/mrr.ts), so the base case reflects the
 * actual new / expansion / churn split rather than an assumed compounding rate.
 *
 * NEW MRR is modeled as an ABSOLUTE seeded from last period's `newMrr`, growing
 * at an assumed monthly rate — NOT as a fraction of the base. Justification:
 * new-logo MRR is an acquisition output (a function of sales/marketing motion),
 * not a function of how large the installed base happens to be. Tying it to the
 * base would wrongly let a bigger base inflate new bookings. Expansion,
 * contraction and churn ARE base-proportional (they act on existing accounts),
 * so those stay as rates.
 */

// ─── Drivers ───────────────────────────────────────────────────────────────────

/** Monthly MRR drivers. Rates are fractions of the existing base (e.g. 0.02 = 2%). */
export interface MrrDrivers {
  /** Existing-base expansion rate (upsell), fraction of base per month. */
  expansionRate: number
  /** Existing-base contraction rate (downgrade), fraction of base per month. */
  contractionRate: number
  /** Existing-base gross logo/MRR churn rate, fraction of base per month. */
  churnRate: number
  /** New-logo MRR added next period, as an ABSOLUTE dollar amount. */
  newMrr: number
  /** Assumed month-over-month growth in new-logo MRR (fraction, e.g. 0.05). */
  newMrrGrowthRate: number
}

/** One projected month of the existing-base waterfall plus new MRR. */
export interface DriverMonth {
  /** Base MRR carried into the month (start of month). */
  startBase: number
  expansion: number
  contraction: number
  churn: number
  newMrr: number
  /** End-of-month MRR = startBase + expansion - contraction - churn + newMrr. */
  endMrr: number
}

const clamp0 = (n: number) => (n > 0 ? n : 0)

/**
 * Project one month forward from a starting base using the drivers. Expansion,
 * contraction and churn act on the START-of-month base; new MRR is added on top.
 * Base can't go negative (churn+contraction is capped at the available base).
 */
export function projectDriverMonth(startBase: number, drivers: MrrDrivers): DriverMonth {
  const base = clamp0(startBase)
  const expansion = base * drivers.expansionRate
  // Contraction + churn can't remove more than the base that exists.
  const grossLoss = base * (drivers.contractionRate + drivers.churnRate)
  const cappedLoss = Math.min(grossLoss, base)
  const lossScale = grossLoss > 0 ? cappedLoss / grossLoss : 0
  const contraction = base * drivers.contractionRate * lossScale
  const churn = base * drivers.churnRate * lossScale
  const newMrr = clamp0(drivers.newMrr)
  const endMrr = base + expansion - contraction - churn + newMrr
  return { startBase: base, expansion, contraction, churn, newMrr, endMrr }
}

/**
 * The per-month NEW-logo MRR stream the projection adds each forecast month.
 *
 * This is the SINGLE source of truth for "new MRR per month": both the flat-
 * driver MRR path (`projectDriverSeries`) and the cohort-decay path spawn the
 * same fresh age-0 cohort each month — `newMrr × (1 + newMrrGrowthRate)^t`. The
 * opex model consumes exactly this stream (new logos = newMrr ÷ ARPU), so MRR
 * growth and the S&M that funds it always agree. New MRR is an acquisition output
 * (absolute, growing at its own rate), independent of base size — consistent with
 * the rest of the driver model. Floored at 0 (you can't add negative new logos).
 */
export function newMrrSeriesFrom(
  newMrr: number,
  newMrrGrowthRate: number,
  horizonMonths: number,
): number[] {
  const out: number[] = []
  let cur = clamp0(newMrr)
  for (let i = 0; i < horizonMonths; i++) {
    out.push(cur)
    cur = cur * (1 + newMrrGrowthRate)
  }
  return out
}

/**
 * Project an MRR series `horizonMonths` long from a starting base. Each month's
 * end MRR becomes the next month's base; new MRR compounds at `newMrrGrowthRate`.
 * Returns rounded end-of-month MRR for each forecast month.
 */
export function projectDriverSeries(
  startMrr: number,
  drivers: MrrDrivers,
  horizonMonths: number,
): number[] {
  const out: number[] = []
  let base = clamp0(startMrr)
  let newMrr = clamp0(drivers.newMrr)
  for (let i = 0; i < horizonMonths; i++) {
    const m = projectDriverMonth(base, { ...drivers, newMrr })
    out.push(Math.round(m.endMrr))
    base = m.endMrr
    newMrr = newMrr * (1 + drivers.newMrrGrowthRate)
  }
  return out
}

// ─── Derive drivers from real movement ─────────────────────────────────────────

import type { Waterfall } from '@/lib/metrics/mrr'

/** Multipliers that turn the base-case drivers into bear / base / bull variants. */
export interface ScenarioTilt {
  /** Scales expansion + new MRR (the growth levers). */
  growthMultiplier: number
  /** Scales contraction + churn (the retention/loss levers). */
  churnMultiplier: number
}

/**
 * Derive monthly drivers from a real `Waterfall` (the customer's last-period
 * movement) and apply a scenario tilt.
 *
 * Rates are taken relative to STARTING MRR (the base the movement acted on):
 *   expansionRate    = expansionMrr  / startMrr
 *   contractionRate  = contractionMrr / startMrr
 *   churnRate        = churnedMrr     / startMrr
 *   newMrr           = newMrr (absolute), grown at `newMrrGrowthRate`
 *
 * Growth levers (expansion, new MRR) scale by `growthMultiplier`; loss levers
 * (contraction, churn) scale by `churnMultiplier`. With multipliers of 1 the
 * derived drivers exactly reproduce the observed movement.
 */
export function deriveDrivers(
  w: Waterfall,
  tilt: ScenarioTilt = { growthMultiplier: 1, churnMultiplier: 1 },
  newMrrGrowthRate = 0,
): MrrDrivers {
  const denom = w.startMrr > 0 ? w.startMrr : 0
  const expansionRate = denom > 0 ? w.expansionMrr / denom : 0
  const contractionRate = denom > 0 ? w.contractionMrr / denom : 0
  const churnRate = denom > 0 ? w.churnedMrr / denom : 0

  return {
    expansionRate: expansionRate * tilt.growthMultiplier,
    contractionRate: contractionRate * tilt.churnMultiplier,
    churnRate: churnRate * tilt.churnMultiplier,
    newMrr: clamp0(w.newMrr) * tilt.growthMultiplier,
    newMrrGrowthRate,
  }
}
