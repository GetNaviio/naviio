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
import { persistDecision } from '@/lib/decisions/persist'
import { parseDecisionQuestion } from '@/lib/decisions/parse'
import { prisma } from '@/lib/prisma'
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

export const POST = withOrg(async (request, { user, orgId }) => {
  let body: { template?: string; params?: Record<string, unknown>; question?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const questionText = typeof body.question === 'string' ? body.question.trim() : ''

  let template: Template
  let params: Record<string, unknown>

  if (typeof body.question === 'string' && body.question.trim()) {
    // Natural-language path: parse the question into a template + the numbers the
    // user stated. If required inputs are missing, hand the parse back (no charge)
    // so the UI can pre-fill the form and ask for the rest.
    const parsed = parseDecisionQuestion(body.question)
    if (parsed.missing.length > 0) {
      return Response.json({ needs: parsed }, { status: 200 })
    }
    template = parsed.template
    params = parsed.params as Record<string, unknown>
  } else {
    template = body.template as Template
    if (!TEMPLATES.includes(template)) {
      return Response.json({ error: `Unknown template. Use one of: ${TEMPLATES.join(', ')}.` }, { status: 400 })
    }
    params = body.params ?? {}
    const invalid = validate(template, params)
    if (invalid) return Response.json({ error: invalid }, { status: 400 })
  }

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

    // Persist the decision — the proprietary, compounding dataset behind the moat
    // (question, inputs, verdict; outcome captured later). Shared helper, also used
    // by the Navi agent's run_decision tool so both paths feed the outcome loop.
    const decisionId = await persistDecision({ orgId, userId: user.id, template, question: questionText, params, answer })

    return Response.json({
      answer,
      decisionId,
      params,
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

/** Recent decisions for this org — the start of the decision history / audit trail. */
export const GET = withOrg(async (_request, { orgId }) => {
  try {
    const decisions = await prisma.$queryRaw<Array<{
      id: string; template: string; question: string | null; verdict: string;
      headline: string; confidence: string; outcome: string | null; createdAt: Date
    }>>`
      SELECT "id", "template", "question", "verdict", "headline", "confidence", "outcome", "createdAt"
      FROM "DecisionLog" WHERE "orgId" = ${orgId}
      ORDER BY "createdAt" DESC LIMIT 50
    `
    return Response.json({ decisions })
  } catch {
    // Table may not exist yet (migration pending) — degrade gracefully.
    return Response.json({ decisions: [] })
  }
})

const OUTCOMES = ['proceeded', 'deferred', 'declined'] as const

/** Record what the user actually did — closes the predicted-vs-actual loop. */
export const PATCH = withOrg(async (request, { orgId }) => {
  let body: { id?: string; outcome?: string; note?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const id = typeof body.id === 'string' ? body.id : ''
  const outcome = body.outcome ?? ''
  if (!id || !OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) {
    return Response.json({ error: `id and outcome (${OUTCOMES.join(' | ')}) are required.` }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null

  try {
    // Scoped to the org so a user can only update their own org's decisions.
    const affected = await prisma.$executeRaw`
      UPDATE "DecisionLog" SET "outcome" = ${outcome}, "outcomeNote" = ${note}, "outcomeAt" = now()
      WHERE "id" = ${id} AND "orgId" = ${orgId}
    `
    if (affected === 0) return Response.json({ error: 'Decision not found.' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (e) {
    console.error('outcome update failed:', e)
    return Response.json({ error: 'Could not record the outcome.' }, { status: 200 })
  }
})
