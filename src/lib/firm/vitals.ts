/**
 * Client vitals: the compact health read a fractional CFO needs to triage their
 * whole book at a glance. Pure — given a client's headline numbers it derives an
 * overall Navi score, a status, and the "needs attention" reasons. The async
 * per-org data loading lives in the advisor-home API; this is the judgement layer
 * so it can be unit-tested without a DB.
 */
import { scoreProfitability, scoreRevenueGrowth, scoreLiquidity, overallScore } from '@/lib/metrics/scoring'
import type { Industry } from '@/lib/metrics/industry'

export type ClientStatus = 'healthy' | 'watch' | 'at_risk' | 'no_data' | 'needs_reconnect'

export interface VitalInputs {
  netMargin: number | null      // %
  revenueGrowth: number | null  // month-over-month %
  runwayMonths: number | null   // Infinity = cash-positive; null = unknown
  industry: Industry
  hasData: boolean
  hasAccess: boolean            // advisor still has access to this client org
}

export interface VitalResult {
  score: number | null
  status: ClientStatus
  alerts: string[]
}

const finiteRunway = (r: number | null): r is number => r != null && Number.isFinite(r)

/** Derive a client's overall score, triage status, and attention reasons. */
export function deriveVitals(v: VitalInputs): VitalResult {
  if (!v.hasAccess) {
    return { score: null, status: 'needs_reconnect', alerts: ['Advisor access was revoked — ask the client to re-invite you'] }
  }
  if (!v.hasData) {
    return { score: null, status: 'no_data', alerts: ['No financial data yet — client needs to connect a bank or Stripe'] }
  }

  // Compact score from the always-available cash-basis dimensions, graded on the
  // client's industry curve. overallScore normalizes over whichever are present.
  const score = overallScore([
    { score: scoreProfitability(v.netMargin, v.industry), weight: 0.3 },
    { score: scoreRevenueGrowth(v.revenueGrowth, v.industry), weight: 0.3 },
    { score: scoreLiquidity(v.runwayMonths, v.industry), weight: 0.4 },
  ])

  const alerts: string[] = []
  if (finiteRunway(v.runwayMonths) && v.runwayMonths < 3) alerts.push(`Runway under 3 months (${v.runwayMonths.toFixed(0)}mo)`)
  if (v.netMargin != null && v.netMargin < -10) alerts.push(`Operating at a loss (${v.netMargin.toFixed(0)}% net margin)`)
  if (v.revenueGrowth != null && v.revenueGrowth < -10) alerts.push(`Revenue down ${Math.abs(v.revenueGrowth).toFixed(0)}% MoM`)
  if (score != null && score < 50) alerts.push('Navi Score in the danger zone')

  let status: ClientStatus = 'healthy'
  const critical = (finiteRunway(v.runwayMonths) && v.runwayMonths < 3) || (score != null && score < 50) || (v.netMargin != null && v.netMargin < -10)
  const watch = (finiteRunway(v.runwayMonths) && v.runwayMonths < 6) || (score != null && score < 70)
  if (critical) status = 'at_risk'
  else if (watch) status = 'watch'

  return { score, status, alerts }
}
