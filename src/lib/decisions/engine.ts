/**
 * Navi Decision Engine — pure, deterministic financial math.
 *
 * THE RULE: this module is the ONLY place that does arithmetic on a customer's
 * money for a decision answer. It has no I/O and no model calls — every output
 * is a deterministic function of its inputs, so it can be unit-tested exactly
 * and the LLM layer can only restate numbers it produced. (See blueprint §2/§5.)
 */
import type {
  AffordabilityInput, AffordabilityResult,
  CapexInput, CapexResult,
  RunwayPathInput, RunwayPathResult,
  SeriesPoint,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Fixed monthly payment to amortize `principal` over `termMonths` at annual
 * rate `apr`. Standard amortization formula; falls back to straight-line when
 * the rate is zero. Returns 0 for a non-positive principal.
 */
export function amortizedMonthlyPayment(principal: number, apr: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0
  if (apr <= 0) return round2(principal / termMonths)
  const r = apr / 12
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -termMonths))
  return round2(pmt)
}

/**
 * Affordability: project the cash balance forward with a one-time outlay and/or
 * a new recurring monthly cost, and check whether it ever dips below the floor.
 * The one-time outlay is applied in month 1.
 */
export function affordabilityCheck(input: AffordabilityInput): AffordabilityResult {
  const { cashBalance, monthlyNet, oneTime = 0, recurringMonthly = 0, horizonMonths, minCashFloor } = input
  const series: SeriesPoint[] = [{ month: 0, value: round2(cashBalance) }]
  let balance = cashBalance
  let lowestBalance = cashBalance
  let lowestMonth = 0
  let breachMonth: number | null = null

  for (let m = 1; m <= horizonMonths; m++) {
    balance += monthlyNet - recurringMonthly
    if (m === 1) balance -= oneTime
    balance = round2(balance)
    series.push({ month: m, value: balance })
    if (balance < lowestBalance) { lowestBalance = balance; lowestMonth = m }
    if (breachMonth === null && balance < minCashFloor) breachMonth = m
  }

  return {
    canAfford: lowestBalance >= minCashFloor,
    projectedBalance: balance,
    lowestBalance,
    lowestMonth,
    breachesFloor: breachMonth !== null,
    breachMonth,
    series,
  }
}

/**
 * Capex / investment ROI: payback, break-even units, and cash effect for buying
 * (optionally financing) an asset against its unit economics.
 *
 * The economic cost to recover is the price plus any interest if financed.
 * Contribution per unit = average revenue × gross margin.
 */
export function capexAnalysis(input: CapexInput): CapexResult {
  const { price, downPayment = 0, apr = 0, termMonths = 0, avgRevenuePerUnit, grossMarginPct, unitsPerMonth } = input
  const financed = termMonths > 0 && price - downPayment > 0 && (apr > 0 || termMonths > 0) && downPayment < price
  const principal = Math.max(0, price - downPayment)
  const monthlyPayment = financed ? amortizedMonthlyPayment(principal, apr, termMonths) : 0
  const totalFinanceCost = financed ? round2(monthlyPayment * termMonths - principal) : 0
  const totalCost = round2(price + totalFinanceCost)

  const contributionPerUnit = round2(avgRevenuePerUnit * grossMarginPct)
  const monthlyContribution = round2(contributionPerUnit * unitsPerMonth)

  const breakEvenUnits = contributionPerUnit > 0 ? Math.ceil(totalCost / contributionPerUnit) : Infinity
  const paybackMonths = monthlyContribution > 0 ? round2(totalCost / monthlyContribution) : null
  const netMonthlyCashEffect = round2(monthlyContribution - monthlyPayment)
  const firstYearRoiPct = price > 0
    ? round2(((monthlyContribution * 12 - (financed ? monthlyPayment * 12 : 0)) / price) * 100)
    : null

  return {
    financed,
    principal: round2(principal),
    monthlyPayment,
    totalFinanceCost,
    totalCost,
    contributionPerUnit,
    monthlyContribution,
    breakEvenUnits: Number.isFinite(breakEvenUnits) ? breakEvenUnits : Infinity,
    paybackMonths: paybackMonths != null && Number.isFinite(paybackMonths) ? paybackMonths : null,
    netMonthlyCashEffect,
    firstYearRoiPct,
  }
}

/** Units (or revenue) required to cover a new fixed monthly cost. */
export function breakevenUnits(fixedAddMonthly: number, contributionPerUnit: number): number {
  if (contributionPerUnit <= 0) return Infinity
  return Math.ceil(fixedAddMonthly / contributionPerUnit)
}

/**
 * Runway path: project cash forward from the current net burn, optionally adding
 * recurring cost (hires) and a monthly improvement to net (growth). Reports when
 * cash runs out, when the business turns net-positive, and the ending balance.
 */
export function runwayPath(input: RunwayPathInput): RunwayPathResult {
  const { cashBalance, monthlyNet, addedMonthlyCost = 0, monthlyNetImprovement = 0, horizonMonths } = input
  const series: SeriesPoint[] = [{ month: 0, value: round2(cashBalance) }]
  let balance = cashBalance
  let net = monthlyNet - addedMonthlyCost
  let runwayMonths: number | null = null
  let profitabilityMonth: number | null = null
  let lowestBalance = cashBalance

  for (let m = 1; m <= horizonMonths; m++) {
    if (profitabilityMonth === null && net >= 0) profitabilityMonth = m
    balance = round2(balance + net)
    series.push({ month: m, value: balance })
    if (balance < lowestBalance) lowestBalance = balance
    if (runwayMonths === null && balance <= 0) runwayMonths = m
    net = round2(net + monthlyNetImprovement)
  }

  return {
    // Cash-positive or never-depleted within horizon → no finite runway limit.
    runwayMonths,
    endingCash: balance,
    profitabilityMonth,
    lowestBalance,
    series,
  }
}

/**
 * Run the same analysis across parameter variants (e.g. 10/15/20 units per
 * month) so an answer can offer scenarios. Generic over the analyzer.
 */
export function scenarioCompare<TIn, TOut>(
  base: TIn,
  variants: Partial<TIn>[],
  analyze: (input: TIn) => TOut,
): { input: TIn; result: TOut }[] {
  return variants.map((v) => {
    const input = { ...base, ...v }
    return { input, result: analyze(input) }
  })
}
