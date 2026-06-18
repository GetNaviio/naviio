/**
 * Navi agent tool registry.
 *
 * These are the capabilities the in-product Navi agent can call to answer with
 * the user's REAL numbers. Two principles hold the trust layer:
 *   1. Compute, don't hallucinate — every figure comes from a tool (the metric
 *      engine or the deterministic decision engine), never from the model.
 *   2. Reads are free to run; ACTIONS (side effects) are never executed by the
 *      loop — they're surfaced to the user as a proposed action to confirm.
 *
 * Each tool is org-scoped: the route passes the authenticated orgId; tools never
 * accept an org from the model.
 */
import { prisma } from '@/lib/prisma'
import { loadPrimaryLedger, startOfYearUTC, monthsAgoUTC, connectedProviders, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'
import { getStripeMetrics } from '@/lib/integrations/stripe'
import { getFinancialContext } from '@/lib/decisions/context'
import {
  buildAffordabilityAnswer, buildCapexAnswer, buildRunwayPathAnswer,
  type AffordabilityParams, type CapexParams, type RunwayPathParams,
} from '@/lib/decisions/templates'

export interface NaviTool {
  name: string
  /** Short present-tense activity label shown in the UI while it runs. */
  label: string
  description: string
  kind: 'read' | 'action'
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  run: (orgId: string, input: Record<string, unknown>) => Promise<unknown>
}

const NO_INPUT = { type: 'object' as const, properties: {} }

export const NAVI_TOOLS: NaviTool[] = [
  {
    name: 'financial_snapshot',
    label: 'Reading your P&L and cash',
    description:
      'The current cash-basis financial snapshot: year-to-date income statement (income, expenses, net income, net margin), cash balance, monthly net burn, and runway. Use for any question about profitability, spend, cash, burn, or runway.',
    kind: 'read',
    input_schema: NO_INPUT,
    run: async (orgId) => {
      const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
      const overrides = await categoryOverrides(orgId)
      const is = incomeStatement(ledger, startOfYearUTC(), undefined, overrides)
      const cf = cashFlow(ledger)
      const providers = await connectedProviders(orgId)
      const cash = providers.has('PLAID') ? await getCashBalance(orgId).catch(() => null) : null
      const runway = cash != null && cf.burnRate > 0 ? runwayMonths(cash, cf.burnRate) : null
      return {
        basis: 'cash', period: 'year-to-date',
        totalIncome: is.totalIncome, totalExpenses: is.totalExpenses, netIncome: is.netIncome,
        netMarginPct: is.netMargin, cashBalance: cash,
        monthlyNetBurn: cf.burnRate > 0 ? cf.burnRate : 0,
        runwayMonths: runway, connected: [...providers],
      }
    },
  },
  {
    name: 'revenue_metrics',
    label: 'Checking your recurring revenue',
    description:
      'Subscription/recurring-revenue metrics from Stripe: MRR, ARR, active customers, monthly churn rate, and LTV. Use for SaaS questions (MRR, churn, customers, LTV). Returns connected:false if Stripe is not linked.',
    kind: 'read',
    input_schema: NO_INPUT,
    run: async (orgId) => {
      const m = await getStripeMetrics(orgId)
      if (!m) return { connected: false, note: 'Stripe is not connected.' }
      return {
        connected: true, mrr: m.mrr, arr: m.arr,
        activeCustomers: m.customers?.total ?? null,
        churnRatePct: (m.churnRate ?? 0) * 100, ltv: m.ltv ?? null,
      }
    },
  },
  {
    name: 'expenses_by_category',
    label: 'Breaking down your expenses',
    description:
      'Year-to-date operating expenses grouped by category (e.g. Payroll, Software & Services, Rent). Use for "where is my money going" / spend-by-category questions.',
    kind: 'read',
    input_schema: NO_INPUT,
    run: async (orgId) => {
      const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
      const overrides = await categoryOverrides(orgId)
      const is = incomeStatement(ledger, startOfYearUTC(), undefined, overrides)
      return { period: 'year-to-date', totalExpenses: is.totalExpenses, byCategory: is.expensesByCategory }
    },
  },
  {
    name: 'recent_transactions',
    label: 'Pulling recent transactions',
    description:
      'The most recent ledger transactions (date, description, merchant, amount, direction). Use to investigate specific spend or recent activity. Default 20, max 50.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many to return (max 50).' } },
    },
    run: async (orgId, input) => {
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50)
      const rows = await prisma.transaction.findMany({
        where: { orgId }, orderBy: { date: 'desc' }, take: limit,
        select: { date: true, description: true, amount: true, merchantName: true, type: true },
      })
      return rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        description: r.description, merchant: r.merchantName, amount: r.amount,
        direction: r.type === 'CREDIT' ? 'in' : 'out',
      }))
    },
  },
  {
    name: 'run_decision',
    label: 'Running the numbers',
    description:
      'Run the DETERMINISTIC decision engine for a financial decision and get a grounded verdict + figures. ' +
      'templates: "affordability" (can we afford a one-time/recurring cost — params: {amount, recurringMonthly?, horizonMonths?}), ' +
      '"capex" (equipment/asset ROI — params: {price, avgRevenuePerUnit, grossMarginPct (0..1), unitsPerMonth, apr?, termMonths?}), ' +
      '"runway_path" (how a change affects runway — params: {addedMonthlyCost?, monthlyNetImprovement?, horizonMonths?}). ' +
      'ALWAYS use this for affordability/ROI/runway "what-if" questions instead of doing the math yourself.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['affordability', 'capex', 'runway_path'] },
        params: { type: 'object', description: 'Template-specific numeric inputs the user stated.' },
      },
      required: ['template', 'params'],
    },
    run: async (orgId, input) => {
      const ctx = await getFinancialContext(orgId)
      const template = String(input.template)
      const p = (input.params ?? {}) as Record<string, unknown>
      const answer =
        template === 'affordability' ? buildAffordabilityAnswer(ctx, p as unknown as AffordabilityParams)
        : template === 'capex' ? buildCapexAnswer(ctx, p as unknown as CapexParams)
        : buildRunwayPathAnswer(ctx, p as unknown as RunwayPathParams)
      return {
        verdict: answer.verdict, headline: answer.headline, summary: answer.summary,
        figures: answer.stats, considerations: answer.considerations, confidence: answer.confidence,
      }
    },
  },
]

export const READ_TOOLS = NAVI_TOOLS.filter((t) => t.kind === 'read')
export const toolByName = (name: string) => NAVI_TOOLS.find((t) => t.name === name)
