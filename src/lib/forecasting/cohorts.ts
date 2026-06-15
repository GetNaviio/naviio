/**
 * Cohort-decay revenue retention (pure, side-effect-free, unit-tested).
 *
 * FP&A principle: a single blended churn rate misprices a base whose cohort mix
 * is shifting. Older cohorts have already survived their early-life churn and
 * retain differently from cohorts acquired last month. The accurate way to roll
 * the installed base forward is to AGE each cohort along an empirical retention
 * curve, and to add new MRR as fresh cohorts (age 0) that then decay on the same
 * curve.
 *
 * This module:
 *  1. Derives a blended monthly retention curve BY AGE (offset) from the
 *     customer's real cohort-retention table (`cohortRetention` in metrics/mrr).
 *  2. Converts that cumulative-retention curve into per-step SURVIVAL rates
 *     `r[age] = retention[age+1] / retention[age]` so each cohort can be aged one
 *     month at a time from its current age.
 *  3. Projects total MRR forward by aging every existing cohort along the curve
 *     and spawning a new age-0 cohort each forecast month.
 */

// ─── Inputs ────────────────────────────────────────────────────────────────────

/** One acquisition cohort's observed MRR-retention, matching `cohortRetention`. */
export interface CohortSeries {
  /** Acquisition month, 'YYYY-MM'. */
  cohort: string
  /** Starting (M0) MRR of the cohort. */
  base: number
  /** Observed retention by month offset (0 = acquisition month). */
  points: { offset: number; mrr: number; pct: number }[]
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const clamp0 = (n: number) => (n > 0 ? n : 0)

// ─── Derive the blended retention curve ────────────────────────────────────────

/**
 * A retention curve expressed as PER-STEP survival rates by age.
 * `step[age]` is the fraction of MRR that survives from `age` → `age + 1`.
 * `maxOffset` is the largest age with a real observation behind the curve.
 * `fallbackStep` is used for ages beyond the observed data (the last known step,
 * or a provided default).
 */
export interface RetentionCurve {
  /** Per-step survival rate at each age (index = age). All in [0, 1]. */
  step: number[]
  /** Largest observed offset across all cohorts. */
  maxOffset: number
  /** Survival rate applied beyond the observed horizon. */
  fallbackStep: number
}

/**
 * Derive a blended monthly retention curve by age from real cohort retention.
 *
 * At each offset we aggregate ACROSS cohorts that actually reached that offset:
 *   retention[offset] = Σ mrr(cohort, offset) / Σ base(cohort | reached offset)
 * This is an exposure-weighted blended cumulative-retention curve (a cohort only
 * contributes to an offset it has aged into, so young cohorts don't drag down the
 * tail). We then convert the cumulative curve into per-step survival rates:
 *   r[age] = retention[age + 1] / retention[age]   (clamped to [0, 1])
 *
 * Sparse data: if an age has no observed step, we fall back to the last known
 * step rate (or `defaultStep` if nothing is known yet). retention[0] is forced to
 * 1 (every cohort is fully present at acquisition).
 *
 * @param defaultStep survival rate to assume when there is no data at all (e.g.
 *   1 - blended churn). Defaults to 1 (no decay) so a curve is always returnable.
 */
export function deriveRetentionCurve(
  cohorts: CohortSeries[],
  defaultStep = 1,
): RetentionCurve {
  // Aggregate retained MRR and exposed base at each offset across all cohorts.
  const retainedAt = new Map<number, number>()
  const baseAt = new Map<number, number>()
  let maxOffset = 0

  for (const c of cohorts) {
    const cohortBase = c.base
    if (cohortBase <= 0) continue
    for (const p of c.points) {
      if (p.offset < 0) continue
      retainedAt.set(p.offset, (retainedAt.get(p.offset) ?? 0) + p.mrr)
      // The cohort is "exposed" at this offset because it reached it.
      baseAt.set(p.offset, (baseAt.get(p.offset) ?? 0) + cohortBase)
      if (p.offset > maxOffset) maxOffset = p.offset
    }
  }

  // Blended cumulative retention by offset (offset 0 is anchored to 1).
  const retention: number[] = []
  for (let age = 0; age <= maxOffset; age++) {
    const r = retainedAt.get(age)
    const b = baseAt.get(age)
    retention[age] = age === 0 ? 1 : b && b > 0 && r !== undefined ? r / b : NaN
  }
  retention[0] = 1

  // Convert cumulative retention → per-step survival rates. Where an offset has
  // no observation (NaN), carry forward the last known step rate.
  const step: number[] = []
  let lastKnown = clamp01(defaultStep)
  for (let age = 0; age < maxOffset; age++) {
    const from = retention[age]
    const to = retention[age + 1]
    let r: number
    if (Number.isFinite(from) && Number.isFinite(to) && from > 0) {
      r = clamp01(to / from)
      lastKnown = r
    } else {
      r = lastKnown // sparse age: reuse last known step
    }
    step.push(r)
  }

  return { step, maxOffset, fallbackStep: lastKnown }
}

/** Survival rate for the step from `age` → `age + 1`. */
function stepAt(curve: RetentionCurve, age: number): number {
  if (age < curve.step.length) return curve.step[age]
  return curve.fallbackStep
}

// ─── Tilt the curve for scenarios ──────────────────────────────────────────────

/**
 * Tilt a retention curve for bear/base/bull by scaling each step's LOSS
 * `(1 - r)` by `churnMultiplier` (>1 = more loss = bear, <1 = less loss = bull):
 *   r' = 1 - (1 - r) * churnMultiplier   (clamped to [0, 1])
 * At a multiplier of 1 the curve is unchanged. The fallback step is tilted too.
 */
export function tiltCurve(curve: RetentionCurve, churnMultiplier: number): RetentionCurve {
  const tilt = (r: number) => clamp01(1 - (1 - r) * churnMultiplier)
  return {
    step: curve.step.map(tilt),
    maxOffset: curve.maxOffset,
    fallbackStep: tilt(curve.fallbackStep),
  }
}

// ─── Project the base + new cohorts forward ────────────────────────────────────

/** A cohort tracked during projection: its remaining MRR and current age. */
interface LiveCohort {
  mrr: number
  age: number
}

/**
 * Project total end-of-month MRR for `horizon` months by:
 *  - aging each EXISTING cohort one step per month along the survival curve,
 *    continuing from the cohort's CURRENT age (its latest observed offset); and
 *  - spawning a NEW age-0 cohort each forecast month equal to that month's new
 *    MRR, which then decays on the same curve in subsequent months.
 *
 * New MRR starts at `newMrrPerMonth` and compounds at `newMrrGrowthRate` (an
 * acquisition output, independent of base size — consistent with pass 1).
 *
 * Returns rounded end-of-month total MRR per month (length === horizon).
 */
export function projectCohortSeries(
  existingCohorts: CohortSeries[],
  newMrrPerMonth: number,
  newMrrGrowthRate: number,
  curve: RetentionCurve,
  horizon: number,
): number[] {
  // Seed live cohorts from the LATEST observed point of each existing cohort —
  // that is the current installed MRR and its current age.
  const live: LiveCohort[] = []
  for (const c of existingCohorts) {
    if (!c.points.length) continue
    const latest = c.points.reduce((a, b) => (b.offset > a.offset ? b : a))
    if (latest.mrr > 0) live.push({ mrr: latest.mrr, age: latest.offset })
  }

  const out: number[] = []
  let newMrr = clamp0(newMrrPerMonth)

  for (let month = 0; month < horizon; month++) {
    // 1. Age every live cohort one step along the curve.
    for (const lc of live) {
      lc.mrr = lc.mrr * stepAt(curve, lc.age)
      lc.age += 1
    }
    // 2. Spawn this month's new cohort at age 0 (it decays starting next month).
    if (newMrr > 0) live.push({ mrr: newMrr, age: 0 })

    // 3. Total MRR is the sum of all live cohorts at end of month.
    const total = live.reduce((s, lc) => s + lc.mrr, 0)
    out.push(Math.round(total))

    newMrr = newMrr * (1 + newMrrGrowthRate)
  }
  return out
}

// ─── Expansion layered on retained base (avoids double-counting churn) ─────────

/**
 * Project total MRR where churn/contraction come from the cohort survival curve
 * and expansion is layered on top as a separate rate on the RETAINED base.
 *
 * Double-counting guard: the survival curve already nets out churn AND
 * contraction (it is observed cumulative retention, which reflects every dollar
 * lost). So expansion must NOT be folded into the curve — it is applied as an
 * additive gross-expansion rate on the start-of-month installed base, mirroring
 * pass-1 `expansionRate` (a fraction of the base). Each month:
 *
 *   decayedBase   = Σ cohort.mrr aged one step      (curve = churn + contraction)
 *   expansion     = startInstalledBase * expansionRate
 *   newCohortMrr  = this month's new MRR (age 0)
 *   endMrr        = decayedBase + expansion + newCohortMrr
 *
 * Expansion is tracked as its own ever-aging cohort so it, too, decays on the
 * curve in later months (upsell MRR is just as exposed to churn as any other).
 */
export function projectCohortSeriesWithExpansion(
  existingCohorts: CohortSeries[],
  newMrrPerMonth: number,
  newMrrGrowthRate: number,
  expansionRate: number,
  curve: RetentionCurve,
  horizon: number,
): number[] {
  const live: LiveCohort[] = []
  for (const c of existingCohorts) {
    if (!c.points.length) continue
    const latest = c.points.reduce((a, b) => (b.offset > a.offset ? b : a))
    if (latest.mrr > 0) live.push({ mrr: latest.mrr, age: latest.offset })
  }

  const out: number[] = []
  let newMrr = clamp0(newMrrPerMonth)
  const exp = clamp0(expansionRate)

  for (let month = 0; month < horizon; month++) {
    // Installed base at start of month (before decay) — what expansion acts on.
    const startInstalled = live.reduce((s, lc) => s + lc.mrr, 0)

    // 1. Age every live cohort one step (curve nets churn + contraction).
    for (const lc of live) {
      lc.mrr = lc.mrr * stepAt(curve, lc.age)
      lc.age += 1
    }
    // 2. Expansion on the start-of-month installed base, as its own age-0 cohort.
    const expansion = startInstalled * exp
    if (expansion > 0) live.push({ mrr: expansion, age: 0 })
    // 3. This month's new-logo cohort at age 0.
    if (newMrr > 0) live.push({ mrr: newMrr, age: 0 })

    const total = live.reduce((s, lc) => s + lc.mrr, 0)
    out.push(Math.round(total))

    newMrr = newMrr * (1 + newMrrGrowthRate)
  }
  return out
}

// ─── Sufficiency gate ──────────────────────────────────────────────────────────

/**
 * Whether the cohort table has enough signal to drive a cohort-decay projection:
 * at least one cohort with a real aging observation (an offset ≥ 1 point with
 * positive base). Below this we fall back to the pass-1 flat-driver path.
 */
export function hasSufficientCohortData(cohorts: CohortSeries[]): boolean {
  return cohorts.some(
    (c) => c.base > 0 && c.points.some((p) => p.offset >= 1),
  )
}
