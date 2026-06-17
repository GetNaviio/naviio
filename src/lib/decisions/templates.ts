/**
 * Decision templates — compose the universal answer contract (DecisionAnswer)
 * from the financial context + the deterministic engine. Even the prose summary
 * is assembled from computed figures; nothing here invents a number.
 */
import { formatCurrency } from '@/lib/utils'
import { affordabilityCheck, capexAnalysis, runwayPath, scenarioCompare } from './engine'
import { confidenceFromHistory, type FinancialContext } from './context'
import type { DecisionAnswer, Stat, Assumption, CapexInput } from './types'

const DISCLAIMER = 'Decision support based on your live data — not licensed financial or tax advice.'

function provenance(ctx: FinancialContext): string {
  const when = new Date(ctx.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  return `Based on ${ctx.historyMonths} month${ctx.historyMonths === 1 ? '' : 's'} of synced data, as of ${when}.`
}

const pct = (n: number) => `${Math.round(n)}%`

// ── A. Affordability / Commitment ───────────────────────────────────────────

export interface AffordabilityParams {
  amount: number               // one-time outlay
  recurringMonthly?: number    // new recurring cost
  horizonMonths?: number
  minCashFloor?: number
  label?: string               // what they're considering ("the lease")
}

export function buildAffordabilityAnswer(ctx: FinancialContext, p: AffordabilityParams): DecisionAnswer {
  const what = p.label ? `${p.label}` : 'this'
  const horizon = p.horizonMonths ?? 3

  if (ctx.cashBalance == null) {
    return {
      template: 'affordability', verdict: 'conditional',
      headline: 'Connect a bank so Navi can answer this from your real cash.',
      summary: `Affordability depends on your live cash balance and burn. Connect a bank account (Plaid) and Navi can tell you whether you can afford ${what}.`,
      stats: [], assumptions: [], considerations: ['No bank connected yet — cash balance is unavailable.'],
      nextSteps: ['Connect a bank on the Integrations page.'],
      confidence: 'low', provenance: provenance(ctx), disclaimer: DISCLAIMER,
    }
  }

  const floor = p.minCashFloor ?? Math.max(0, Math.round(ctx.monthlyBurn * 3))
  const r = affordabilityCheck({
    cashBalance: ctx.cashBalance, monthlyNet: ctx.avgMonthlyNet,
    oneTime: p.amount, recurringMonthly: p.recurringMonthly ?? 0,
    horizonMonths: horizon, minCashFloor: floor,
  })

  const verdict = r.canAfford ? 'yes' : 'no'
  const headline = r.canAfford
    ? `Yes — you can afford ${what} over the next ${horizon} months.`
    : `Not yet — ${what} would drop your cash below your safety floor.`

  const summary = r.canAfford
    ? `After ${formatCurrency(p.amount, true)}${p.recurringMonthly ? ` plus ${formatCurrency(p.recurringMonthly, true)}/mo` : ''}, your projected cash is ${formatCurrency(r.projectedBalance, true)} in ${horizon} months, with a low point of ${formatCurrency(r.lowestBalance, true)} — above your ${formatCurrency(floor, true)} floor.`
    : `This commitment takes your cash to a low of ${formatCurrency(r.lowestBalance, true)} in month ${r.lowestMonth}, below your ${formatCurrency(floor, true)} floor. You could afford it by deferring it, reducing the amount, or raising the floor assumption.`

  const stats: Stat[] = [
    { label: 'Commitment', value: formatCurrency(p.amount, true), raw: p.amount, tone: 'neutral' },
    { label: 'Projected cash', value: formatCurrency(r.projectedBalance, true), raw: r.projectedBalance, tone: r.canAfford ? 'good' : 'bad' },
    { label: 'Lowest point', value: formatCurrency(r.lowestBalance, true), raw: r.lowestBalance, tone: r.breachesFloor ? 'bad' : 'good' },
    { label: 'Cash floor', value: formatCurrency(floor, true), raw: floor, tone: 'neutral' },
  ]

  const assumptions: Assumption[] = [
    { key: 'monthlyNet', label: 'Avg monthly net cash flow', value: r ? ctx.avgMonthlyNet : 0, source: 'inferred', unit: 'usd' },
    { key: 'minCashFloor', label: 'Minimum cash floor', value: floor, source: p.minCashFloor != null ? 'user' : 'default', unit: 'usd' },
    { key: 'horizonMonths', label: 'Horizon', value: horizon, source: p.horizonMonths != null ? 'user' : 'default', unit: 'months' },
  ]

  const considerations: string[] = []
  if (p.recurringMonthly) considerations.push(`Includes a recurring ${formatCurrency(p.recurringMonthly, true)}/mo cost for the full horizon.`)
  if (ctx.historyMonths < 6) considerations.push(`Based on only ${ctx.historyMonths} months of history — the monthly-net assumption is less certain.`)
  considerations.push('Assumes your average monthly cash flow continues; a slow month would lower the low point.')

  return {
    template: 'affordability', verdict, headline, summary, stats, assumptions, considerations,
    series: r.series,
    nextSteps: r.canAfford
      ? ['Adjust the cash floor or horizon to stress-test it.', 'Ask Navi to model it alongside another commitment.']
      : ['Try a later start date or a smaller amount.', 'Ask Navi what raises enough runway to cover it.'],
    confidence: confidenceFromHistory(ctx.historyMonths),
    provenance: provenance(ctx), disclaimer: DISCLAIMER,
  }
}

// ── B. Investment / Capex ROI ───────────────────────────────────────────────

export interface CapexParams extends CapexInput { label?: string }

export function buildCapexAnswer(ctx: FinancialContext, p: CapexParams): DecisionAnswer {
  const what = p.label ?? 'this purchase'
  const r = capexAnalysis(p)

  const scenarios = scenarioCompare(
    p as CapexInput,
    [{ unitsPerMonth: Math.max(1, Math.round(p.unitsPerMonth * 0.67)) }, { unitsPerMonth: p.unitsPerMonth }, { unitsPerMonth: Math.round(p.unitsPerMonth * 1.33) }],
    capexAnalysis,
  )

  const paysBack = r.paybackMonths != null
  const verdict = paysBack ? 'conditional' : 'no'
  const headline = paysBack
    ? `${what} can pay for itself — if you hit the volume.`
    : `At this volume, ${what} doesn't pay back.`

  const summary = paysBack
    ? `At ${p.unitsPerMonth}/mo and a ${formatCurrency(r.contributionPerUnit)} contribution per unit, you recover ${formatCurrency(r.totalCost, true)} in about ${Math.round(r.paybackMonths!)} months (${r.breakEvenUnits} units to break even)${r.financed ? `, with a ${formatCurrency(r.monthlyPayment)}/mo payment` : ''}.`
    : `Each unit contributes ${formatCurrency(r.contributionPerUnit)}, but at ${p.unitsPerMonth}/mo it never covers the ${formatCurrency(r.totalCost, true)} cost. Raise volume, price, or margin to make it work.`

  const stats: Stat[] = [
    { label: 'Contribution / unit', value: formatCurrency(r.contributionPerUnit), raw: r.contributionPerUnit, tone: 'neutral' },
    { label: 'Break-even units', value: Number.isFinite(r.breakEvenUnits) ? String(r.breakEvenUnits) : '—', raw: Number.isFinite(r.breakEvenUnits) ? r.breakEvenUnits : 0, tone: 'neutral' },
    { label: 'Payback', value: paysBack ? `${Math.round(r.paybackMonths!)} mo` : '—', raw: r.paybackMonths ?? 0, tone: paysBack ? 'good' : 'bad' },
    r.financed
      ? { label: 'Monthly payment', value: formatCurrency(r.monthlyPayment), raw: r.monthlyPayment, tone: 'neutral' }
      : { label: 'Net cash / mo', value: formatCurrency(r.netMonthlyCashEffect), raw: r.netMonthlyCashEffect, tone: r.netMonthlyCashEffect >= 0 ? 'good' : 'bad' },
  ]

  const assumptions: Assumption[] = [
    { key: 'price', label: 'Price', value: p.price, source: 'user', unit: 'usd' },
    { key: 'avgRevenuePerUnit', label: 'Avg revenue / unit', value: p.avgRevenuePerUnit, source: 'user', unit: 'usd' },
    { key: 'grossMarginPct', label: 'Gross margin', value: pct(p.grossMarginPct * 100), source: 'user', unit: 'percent' },
    { key: 'unitsPerMonth', label: 'Units / month', value: p.unitsPerMonth, source: 'user', unit: 'count' },
    ...(r.financed ? [{ key: 'financing', label: 'Financing', value: `${pct((p.apr ?? 0) * 100)} APR / ${p.termMonths}mo`, source: 'user' as const }] : []),
  ]

  const considerations = [
    'Payback assumes the volume holds — protect lead flow and utilization.',
    'Factor ongoing marketing/labor needed to drive that volume.',
    r.financed ? 'Financing adds interest to the recoverable cost (already included).' : 'Paid in cash — this hits your balance up front.',
    'Ask your CPA about Section 179 / depreciation — it can change the after-tax return.',
  ]

  const nextSteps = [
    `Compare volumes: ${scenarios.map((s) => `${s.input.unitsPerMonth}/mo → ${s.result.paybackMonths != null ? `${Math.round(s.result.paybackMonths)}mo` : 'no payback'}`).join(', ')}.`,
    'Ask Navi how this affects your runway and cash.',
  ]

  return {
    template: 'capex', verdict, headline, summary, stats, assumptions, considerations, nextSteps,
    confidence: 'medium', provenance: provenance(ctx), disclaimer: DISCLAIMER,
  }
}

// ── C. Strategic / Runway path ──────────────────────────────────────────────

export interface RunwayPathParams {
  addedMonthlyCost?: number
  monthlyNetImprovement?: number
  horizonMonths?: number
}

export function buildRunwayPathAnswer(ctx: FinancialContext, p: RunwayPathParams): DecisionAnswer {
  const horizon = p.horizonMonths ?? 24
  if (ctx.cashBalance == null) {
    return {
      template: 'runway_path', verdict: 'conditional',
      headline: 'Connect a bank so Navi can project your runway.',
      summary: 'Runway and path-to-profitability projections need your live cash balance. Connect a bank (Plaid) to unlock them.',
      stats: [], assumptions: [], considerations: ['No bank connected yet.'],
      nextSteps: ['Connect a bank on the Integrations page.'],
      confidence: 'low', provenance: provenance(ctx), disclaimer: DISCLAIMER,
    }
  }

  const r = runwayPath({
    cashBalance: ctx.cashBalance, monthlyNet: ctx.avgMonthlyNet,
    addedMonthlyCost: p.addedMonthlyCost ?? 0, monthlyNetImprovement: p.monthlyNetImprovement ?? 0,
    horizonMonths: horizon,
  })

  const runwayText = r.runwayMonths == null ? `${horizon}+ months` : `${r.runwayMonths} months`
  const strong = r.runwayMonths == null || r.runwayMonths >= 18
  const verdict = strong ? 'yes' : 'conditional'
  const headline = strong
    ? `You're in a solid position — runway of ${runwayText}.`
    : `Runway is ${runwayText} — worth a plan to extend it.`

  const summary = `${p.addedMonthlyCost ? `Adding ${formatCurrency(p.addedMonthlyCost, true)}/mo of cost, ` : ''}your projected runway is ${runwayText}${r.profitabilityMonth ? ` and you turn net-positive around month ${r.profitabilityMonth}` : ''}. Ending cash over ${horizon} months: ${formatCurrency(r.endingCash, true)}.`

  const stats: Stat[] = [
    { label: 'Projected runway', value: runwayText, raw: r.runwayMonths ?? horizon, tone: strong ? 'good' : 'bad' },
    { label: 'Profitability', value: r.profitabilityMonth ? `month ${r.profitabilityMonth}` : '—', raw: r.profitabilityMonth ?? 0, tone: r.profitabilityMonth ? 'good' : 'neutral' },
    { label: 'Ending cash', value: formatCurrency(r.endingCash, true), raw: r.endingCash, tone: r.endingCash >= 0 ? 'good' : 'bad' },
    { label: 'Lowest cash', value: formatCurrency(r.lowestBalance, true), raw: r.lowestBalance, tone: r.lowestBalance >= 0 ? 'good' : 'bad' },
  ]

  const assumptions: Assumption[] = [
    { key: 'monthlyNet', label: 'Current monthly net', value: ctx.avgMonthlyNet, source: 'inferred', unit: 'usd' },
    ...(p.addedMonthlyCost ? [{ key: 'addedMonthlyCost', label: 'Added monthly cost', value: p.addedMonthlyCost, source: 'user' as const, unit: 'usd' as const }] : []),
    ...(p.monthlyNetImprovement ? [{ key: 'monthlyNetImprovement', label: 'Monthly improvement', value: p.monthlyNetImprovement, source: 'user' as const, unit: 'usd' as const }] : []),
    { key: 'horizonMonths', label: 'Horizon', value: horizon, source: p.horizonMonths != null ? 'user' : 'default', unit: 'months' },
  ]

  const considerations = [
    'Assumes your current monthly net continues, adjusted by the inputs above.',
    ctx.historyMonths < 6 ? `Only ${ctx.historyMonths} months of history — treat the projection as directional.` : 'Built on your trailing cash flow.',
  ]

  return {
    template: 'runway_path', verdict, headline, summary, stats, assumptions, considerations,
    series: r.series,
    nextSteps: strong
      ? ['Model a hiring plan or growth investment against this runway.', 'Export this as a board-ready summary.']
      : ['Ask Navi what cuts or growth extend runway past 18 months.', 'Model a smaller hiring plan.'],
    confidence: confidenceFromHistory(ctx.historyMonths),
    provenance: provenance(ctx), disclaimer: DISCLAIMER,
  }
}
