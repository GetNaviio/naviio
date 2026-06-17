/**
 * Navi Decision Engine — decision endpoint.
 *
 *   POST /api/navi/decision  { template, params }
 *
 * Loads the org's live financial context, runs the deterministic engine for the
 * requested template, and returns the answer contract. Metered like other Navi
 * features; refunds the charge if computation fails so a user is never billed
 * for an error. Numbers come only from the engine (see blueprint §2/§5).
 */
import { withOrg } from '@/lib/api/with-org'
import { chargeCredits, addCredits, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'
import { getFinancialContext } from '@/lib/decisions/context'
import {
  buildAffordabilityAnswer, buildCapexAnswer, buildRunwayPathAnswer,
  type AffordabilityParams, type CapexParams, type RunwayPathParams,
} from '@/lib/decisions/templates'

const TEMPLATES = ['affordability', 'capex', 'runway_path'] as const
type Template = (typeof TEMPLATES)[number]

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Validate params per template; return an error string or null. */
function validate(template: Template, p: Record<string, unknown>): string | null {
  if (template === 'affordability') {
    if (num(p.amount) == null || (num(p.amount) as number) < 0) return 'amount (a non-negative number) is required.'
  }
  if (template === 'capex') {
    if (num(p.price) == null || (num(p.price) as number) <= 0) return 'price (a positive number) is required.'
    if (num(p.avgRevenuePerUnit) == null) return 'avgRevenuePerUnit is required.'
    if (num(p.grossMarginPct) == null) return 'grossMarginPct (0..1) is required.'
    if (num(p.unitsPerMonth) == null) return 'unitsPerMonth is required.'
  }
  // runway_path has no required params (defaults applied).
  return null
}

export const POST = withOrg(async (request, { orgId }) => {
  let body: { template?: string; params?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const template = body.template as Template
  if (!TEMPLATES.includes(template)) {
    return Response.json({ error: `Unknown template. Use one of: ${TEMPLATES.join(', ')}.` }, { status: 400 })
  }
  const params = body.params ?? {}
  const invalid = validate(template, params)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })

  // Meter first (this is the credit gate). Refund if the computation throws.
  try {
    await chargeCredits(orgId, 'navi_message')
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return Response.json({ error: "You're out of credits. Reload to ask Navi.", needed: e.needed, balance: e.balance }, { status: 402 })
    }
    throw e
  }

  try {
    const ctx = await getFinancialContext(orgId)

    const answer =
      template === 'affordability' ? buildAffordabilityAnswer(ctx, params as unknown as AffordabilityParams)
      : template === 'capex' ? buildCapexAnswer(ctx, params as unknown as CapexParams)
      : buildRunwayPathAnswer(ctx, params as unknown as RunwayPathParams)

    return Response.json({
      answer,
      context: {
        cashBalance: ctx.cashBalance,
        runwayMonths: ctx.runwayMonths,
        monthlyBurn: ctx.monthlyBurn,
        historyMonths: ctx.historyMonths,
        sources: ctx.sources,
        generatedAt: ctx.generatedAt,
      },
    })
  } catch (err) {
    // Don't bill for a failed decision.
    await addCredits(orgId, costOf('navi_message'), 'refund', { feature: 'navi_message' }).catch(() => {})
    console.error('decision compute failed:', err)
    return Response.json({ error: 'Could not compute this decision. Please try again.' }, { status: 200 })
  }
})
