/**
 * Navi Decision Engine — shared types.
 *
 * The "answer contract" every decision returns (verdict → math → assumptions →
 * considerations → scenarios → next steps → provenance). See
 * docs/navi-decision-engine-blueprint.md.
 *
 * Design rule: every number in an answer must originate from the deterministic
 * engine (engine.ts), never from a language model. These types carry the
 * computed figures so the UI can render them and the answer can cite them.
 */

export type DecisionTemplate = 'affordability' | 'capex' | 'runway_path'

export type Verdict = 'yes' | 'no' | 'conditional'

export type Confidence = 'high' | 'medium' | 'low'

/** A labelled assumption the user can see and edit, then re-run. */
export interface Assumption {
  key: string
  label: string
  value: number | string
  /** Where it came from: user-entered, inferred from data, or a default. */
  source: 'user' | 'inferred' | 'default'
  unit?: 'usd' | 'percent' | 'count' | 'months' | 'date'
}

/** A single figure shown on a card, always traceable to an engine output. */
export interface Stat {
  label: string
  value: string          // formatted for display
  raw: number            // the exact computed number (for provenance/verification)
  tone?: 'good' | 'bad' | 'neutral'
}

export interface SeriesPoint {
  /** Month offset from today (0 = now). */
  month: number
  label?: string
  value: number
}

/** The universal answer contract. */
export interface DecisionAnswer {
  template: DecisionTemplate
  verdict: Verdict
  /** One-line headline, e.g. "Yes — you can afford this within 3 months." */
  headline: string
  /** Plain-English explanation, composed only from the figures below. */
  summary: string
  stats: Stat[]
  assumptions: Assumption[]
  considerations: string[]
  series?: SeriesPoint[]
  nextSteps: string[]
  confidence: Confidence
  /** Human-readable note on data backing the answer (freshness, history depth). */
  provenance: string
  /** Standing disclaimer. */
  disclaimer: string
}

// ── Engine input/output types ───────────────────────────────────────────────

export interface AffordabilityInput {
  cashBalance: number
  /** Average monthly net cash flow (negative = burn). */
  monthlyNet: number
  /** One-time outlay (e.g. deposit, purchase). */
  oneTime?: number
  /** New recurring monthly cost (e.g. rent). */
  recurringMonthly?: number
  horizonMonths: number
  /** Cash you never want to drop below. */
  minCashFloor: number
}

export interface AffordabilityResult {
  canAfford: boolean
  projectedBalance: number      // balance at end of horizon
  lowestBalance: number
  lowestMonth: number
  breachesFloor: boolean
  breachMonth: number | null
  series: SeriesPoint[]
}

export interface CapexInput {
  price: number
  downPayment?: number
  /** Annual percentage rate (e.g. 0.08). Omit/0 for cash purchase or 0% financing. */
  apr?: number
  termMonths?: number
  /** Unit economics. */
  avgRevenuePerUnit: number
  grossMarginPct: number        // 0..1
  unitsPerMonth: number
}

export interface CapexResult {
  financed: boolean
  principal: number
  monthlyPayment: number
  totalFinanceCost: number      // interest paid over the term
  totalCost: number             // economic cost to recover (price + finance cost)
  contributionPerUnit: number
  monthlyContribution: number
  breakEvenUnits: number
  paybackMonths: number | null  // null if it never pays back at this volume
  netMonthlyCashEffect: number  // contribution - payment (financed) or just contribution
  firstYearRoiPct: number | null
}

export interface RunwayPathInput {
  cashBalance: number
  /** Current average monthly net (negative = burn). */
  monthlyNet: number
  /** Added recurring monthly costs (e.g. new hires' fully-loaded cost). */
  addedMonthlyCost?: number
  /** Monthly improvement to net cash flow (e.g. revenue growth contribution). */
  monthlyNetImprovement?: number
  horizonMonths: number
}

export interface RunwayPathResult {
  runwayMonths: number | null   // null = does not run out within horizon (or cash-positive)
  endingCash: number
  profitabilityMonth: number | null  // first month net >= 0
  lowestBalance: number
  series: SeriesPoint[]
}
