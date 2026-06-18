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
import { USER_CATEGORIES, vendorKey, VENDOR_OVERRIDE_PREFIX } from '@/lib/metrics/classify'
import { recordVendorVote } from '@/lib/metrics/community'
import { detectRecurring } from '@/lib/metrics/recurrence'
import { revenueToSegment } from '@/lib/benchmarks/buckets'
import { getVendorBenchmarks, getCategoryBenchmarks } from '@/lib/benchmarks/read'
import { getVendorTrends } from '@/lib/benchmarks/snapshot'
import { fetchAllData } from '@/lib/integrations'
import * as cache from '@/lib/cache'
import {
  buildAffordabilityAnswer, buildCapexAnswer, buildRunwayPathAnswer,
  type AffordabilityParams, type CapexParams, type RunwayPathParams,
} from '@/lib/decisions/templates'
import { persistDecision } from '@/lib/decisions/persist'

/** Per-call context the agent/route injects — never supplied by the model. */
export interface NaviToolCtx { userId?: string; question?: string }

export interface NaviTool {
  name: string
  /** Short present-tense activity label shown in the UI while it runs. */
  label: string
  description: string
  kind: 'read' | 'action'
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  run: (orgId: string, input: Record<string, unknown>, ctx?: NaviToolCtx) => Promise<unknown>
  /** Actions only: a human-readable summary of what will happen, shown on the
   *  confirm card. The action is NEVER run by the agent loop — only after the
   *  user confirms it (POST /api/navi/action). */
  summarize?: (input: Record<string, unknown>) => string
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
        select: { date: true, description: true, amount: true, merchantName: true, type: true, externalId: true },
      })
      return rows.map((r) => ({
        externalId: r.externalId,
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
    run: async (orgId, input, toolCtx) => {
      const ctx = await getFinancialContext(orgId)
      const template = String(input.template)
      const p = (input.params ?? {}) as Record<string, unknown>
      const answer =
        template === 'affordability' ? buildAffordabilityAnswer(ctx, p as unknown as AffordabilityParams)
        : template === 'capex' ? buildCapexAnswer(ctx, p as unknown as CapexParams)
        : buildRunwayPathAnswer(ctx, p as unknown as RunwayPathParams)
      // Log the decision so agent-run decisions also feed the outcome loop /
      // follow-up cron (parity with the explicit chat decision path).
      if (toolCtx?.userId) {
        void persistDecision({ orgId, userId: toolCtx.userId, template, question: toolCtx.question ?? null, params: p, answer })
      }
      return {
        verdict: answer.verdict, headline: answer.headline, summary: answer.summary,
        figures: answer.stats, considerations: answer.considerations, confidence: answer.confidence,
      }
    },
  },
  {
    name: 'peer_benchmark',
    label: 'Comparing to similar businesses',
    description:
      'Compare what the user pays a recurring vendor against similar-size businesses (anonymized peer median, only when there are enough comparable businesses). Use for "am I overpaying for X?" type questions.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: { vendor: { type: 'string', description: 'Vendor/merchant name as the user refers to it.' } },
      required: ['vendor'],
    },
    run: async (orgId, input) => {
      const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
      const segment = revenueToSegment(incomeStatement(ledger).totalIncome)
      const target = vendorKey({ merchantName: String(input.vendor ?? '') })
      let yourMonthly: number | null = null
      let vk = target
      for (const [k, s] of detectRecurring(ledger)) {
        if (!s.recurring) continue
        if (k === target || (target && (k.includes(target) || target.includes(k)))) { vk = k; yourMonthly = s.avgAmount; break }
      }
      const [bench, trend] = await Promise.all([
        getVendorBenchmarks([vk], segment).then((m) => m.get(vk)),
        getVendorTrends([vk], segment).then((m) => m.get(vk) ?? null),
      ])
      if (!bench) return { available: false, note: 'Not enough comparable businesses yet to benchmark this (need 5+).' }
      return {
        available: true,
        yourMonthly: yourMonthly != null ? Math.round(yourMonthly) : null,
        peerMedian: bench.median, peerP25: bench.p25, peerP75: bench.p75,
        ratioVsPeers: yourMonthly && bench.median ? Math.round((yourMonthly / bench.median) * 100) / 100 : null,
        peers: bench.orgs,
        peerTrend6moPct: trend, // +%/-% peers' price moved over ~the last quarter+, null if not enough history
      }
    },
  },

  {
    name: 'category_benchmark',
    label: 'Comparing spend to peers',
    description:
      'Compare how much of revenue the user spends on a category vs similar-size businesses (anonymized peer median). Use for "do I spend too much on payroll / software / marketing?" type questions.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: { category: { type: 'string', enum: USER_CATEGORIES } },
      required: ['category'],
    },
    run: async (orgId, input) => {
      const category = String(input.category)
      const overrides = await categoryOverrides(orgId).catch(() => undefined)
      const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
      const is = incomeStatement(ledger, undefined, undefined, overrides)
      if (is.totalIncome <= 0) return { available: false, note: 'Need revenue data to compute spend as a share of revenue.' }
      const segment = revenueToSegment(is.totalIncome)
      const bench = (await getCategoryBenchmarks(segment)).get(category)
      if (!bench) return { available: false, note: 'Not enough comparable businesses yet for this category.' }
      const yourSpend = is.expensesByCategory.find((c) => c.category === category)?.amount ?? 0
      const yourPct = Math.round((yourSpend / is.totalIncome) * 1000) / 10
      return {
        available: true, category, yourPct,
        peerMedianPct: bench.medianPct, peerP25Pct: bench.p25Pct, peerP75Pct: bench.p75Pct,
        ratioVsPeers: bench.medianPct > 0 ? Math.round((yourPct / bench.medianPct) * 100) / 100 : null,
        peers: bench.orgs,
      }
    },
  },

  // ─── Actions (NEVER auto-run; surfaced for the user to confirm) ──────────────
  {
    name: 'trigger_sync',
    label: 'Re-syncing your accounts',
    description:
      'Re-pull the latest data from all connected integrations (bank, Stripe, accounting) and refresh the dashboard. Propose this when the user asks to refresh/update their data or when figures look stale.',
    kind: 'action',
    input_schema: NO_INPUT,
    summarize: () => 'Re-sync all connected accounts now (pulls the latest transactions and refreshes every metric).',
    run: async (orgId) => {
      await fetchAllData(orgId)
      return { ok: true, syncedAt: new Date().toISOString() }
    },
  },
  {
    name: 'reclassify_transaction',
    label: 'Recategorizing',
    description:
      'Change the category of a transaction (and, by default, every transaction from that vendor going forward). ' +
      'Get the externalId from recent_transactions. category must be one of: ' + USER_CATEGORIES.join(', ') + '. ' +
      'Propose this when the user says a transaction/vendor is miscategorized.',
    kind: 'action',
    input_schema: {
      type: 'object',
      properties: {
        externalId: { type: 'string', description: 'The transaction externalId (from recent_transactions).' },
        category: { type: 'string', enum: USER_CATEGORIES },
        applyToVendor: { type: 'boolean', description: 'Apply to the whole vendor (default true) or just this one.' },
      },
      required: ['externalId', 'category'],
    },
    summarize: (input) =>
      `Recategorize ${input.applyToVendor === false ? 'this transaction' : 'this vendor'} as "${String(input.category)}"${input.applyToVendor === false ? '' : ' (and future transactions from it)'}.`,
    run: async (orgId, input) => {
      const externalId = String(input.externalId ?? '')
      const category = String(input.category ?? '')
      const applyToVendor = input.applyToVendor !== false
      if (!externalId || !USER_CATEGORIES.includes(category)) return { ok: false, error: 'externalId and a valid category are required.' }
      const txn = await prisma.transaction.findFirst({ where: { orgId, externalId }, select: { merchantName: true, description: true } })
      if (!txn) return { ok: false, error: 'Transaction not found.' }
      if (applyToVendor) {
        const key = `${VENDOR_OVERRIDE_PREFIX}${vendorKey(txn)}`
        await prisma.txnClassification.upsert({
          where: { orgId_externalId: { orgId, externalId: key } },
          create: { orgId, externalId: key, category },
          update: { category },
        })
        void recordVendorVote(vendorKey(txn), category)
      } else {
        await prisma.txnClassification.upsert({
          where: { orgId_externalId: { orgId, externalId } },
          create: { orgId, externalId, category },
          update: { category },
        })
      }
      await cache.delPattern(`org:${orgId}:*`)
      return { ok: true, category, appliedTo: applyToVendor ? 'vendor' : 'transaction' }
    },
  },
  {
    name: 'create_scenario',
    label: 'Saving a forecast scenario',
    description:
      'Create a custom forecast scenario the user can model on the Forecast tab. Multipliers are relative to the base case (1 = unchanged, 1.2 = +20%, 0.8 = -20%), each between 0 and 10. ' +
      'Propose this when the user describes a what-if they want saved (e.g. "model 30% faster growth with double churn").',
    kind: 'action',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short scenario name.' },
        growthMultiplier: { type: 'number', description: 'Revenue-growth multiplier vs base (1 = unchanged).' },
        churnMultiplier: { type: 'number', description: 'Churn multiplier vs base.' },
        opexGrowthMultiplier: { type: 'number', description: 'Opex-growth multiplier vs base.' },
      },
      required: ['name', 'growthMultiplier', 'churnMultiplier', 'opexGrowthMultiplier'],
    },
    summarize: (input) =>
      `Save forecast scenario "${String(input.name)}" — growth ×${Number(input.growthMultiplier)}, churn ×${Number(input.churnMultiplier)}, opex ×${Number(input.opexGrowthMultiplier)}.`,
    run: async (orgId, input) => {
      const name = String(input.name ?? '').trim().slice(0, 100)
      const clamp = (v: unknown) => Math.max(0, Math.min(10, Number(v)))
      const growthMultiplier = clamp(input.growthMultiplier)
      const churnMultiplier = clamp(input.churnMultiplier)
      const opexGrowthMultiplier = clamp(input.opexGrowthMultiplier)
      if (!name || ![growthMultiplier, churnMultiplier, opexGrowthMultiplier].every(Number.isFinite)) {
        return { ok: false, error: 'A name and three finite multipliers (0–10) are required.' }
      }
      const row = await prisma.forecastScenario.create({
        data: { orgId, name, growthMultiplier, churnMultiplier, opexGrowthMultiplier },
      })
      return { ok: true, scenarioId: row.id, name }
    },
  },
  {
    name: 'export_board_pack',
    label: 'Preparing your board pack',
    description:
      'Generate a board-ready financial pack (key metrics, P&L year-to-date, top expenses) the user can save as PDF. Propose this when the user asks for a board update, investor update, or a PDF/export of their financials.',
    kind: 'action',
    input_schema: NO_INPUT,
    summarize: () => 'Generate a board-ready financial pack (cash, runway, P&L, top expenses) you can save as PDF.',
    // Read-only: generation happens in the route when the link is opened.
    run: async () => ({ ok: true, url: '/api/navi/board-pack', openInNewTab: true }),
  },
]

export const READ_TOOLS = NAVI_TOOLS.filter((t) => t.kind === 'read')
export const ACTION_TOOLS = NAVI_TOOLS.filter((t) => t.kind === 'action')
export const toolByName = (name: string) => NAVI_TOOLS.find((t) => t.name === name)
