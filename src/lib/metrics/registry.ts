/**
 * Industry metric registry.
 *
 * Each metric declares which industries it applies to and computes itself from a
 * shared context (derived from the live P&L + Stripe metrics). A metric that
 * applies to the business but can't be computed from the data we have yet returns
 * `null` — the UI lists it as "connect X to unlock" rather than showing a fake or
 * $0 value. Pure + side-effect free so the formulas are unit-tested.
 *
 * The universal core (revenue, gross margin, net margin, cash) already renders on
 * the dashboard; this registry is the INDUSTRY layer that sits on top.
 */
import type { Industry } from './industry'

export interface MetricContext {
  revenue: number          // total income, period
  cogs: number             // cost of revenue, period
  grossProfit: number      // revenue − cogs
  grossMargin: number | null // %
  netMargin: number | null   // %
  payroll: number          // 'Payroll & Contractors' spend, period
  adSpend: number          // 'Advertising & Marketing' spend, period
  refundRate: number | null  // 0–1 (Stripe)
  customers: number | null   // active customer count (Stripe), else null
  cac: number | null         // customer acquisition cost
  /** Order/transaction count — null until a store/POS feed provides it. */
  orders: number | null
}

export interface MetricDef {
  id: string
  label: string
  industries: Industry[]
  compute: (c: MetricContext) => number | null
  format: (v: number) => string
  benchmark?: string
  tooltip: string
  /** Shown when the metric applies to the industry but its data isn't available. */
  unlock?: string
}

const pct = (v: number) => `${v.toFixed(1)}%`
const pct0 = (v: number) => `${v.toFixed(0)}%`
const money = (v: number) => `$${Math.round(v).toLocaleString()}`
const ratio = (v: number) => `${v.toFixed(1)}x`
const safePct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null)

export const METRIC_REGISTRY: MetricDef[] = [
  // ── E-commerce / DTC ──────────────────────────────────────────────────────
  {
    id: 'contribution_margin', label: 'Contribution Margin', industries: ['ecommerce'],
    compute: (c) => safePct(c.grossProfit - c.adSpend, c.revenue),
    format: pct, benchmark: 'Target ≥ 30%',
    tooltip: 'Revenue minus COGS and ad spend, ÷ revenue — what each sale contributes after variable costs.',
  },
  {
    id: 'refund_rate', label: 'Refund Rate', industries: ['ecommerce'],
    compute: (c) => (c.refundRate == null ? null : c.refundRate * 100),
    format: pct, benchmark: 'Lower is better',
    tooltip: 'Refunded ÷ gross charged (Stripe).',
    unlock: 'Connect Stripe for refund data',
  },
  {
    id: 'marketing_ratio', label: 'Marketing % of Revenue', industries: ['ecommerce'],
    compute: (c) => safePct(c.adSpend, c.revenue),
    format: pct, benchmark: 'Watch the trend',
    tooltip: 'Tagged ad spend ÷ revenue.',
  },
  {
    id: 'aov', label: 'Average Order Value', industries: ['ecommerce'],
    compute: (c) => (c.orders && c.orders > 0 ? c.revenue / c.orders : null),
    format: money, tooltip: 'Revenue ÷ number of orders.',
    unlock: 'Connect your store (Shopify) for order counts',
  },

  // ── Restaurant / Hospitality ──────────────────────────────────────────────
  {
    id: 'prime_cost', label: 'Prime Cost', industries: ['restaurant'],
    compute: (c) => safePct(c.cogs + c.payroll, c.revenue),
    format: pct, benchmark: 'Target ≤ 60%',
    tooltip: 'Food + labor ÷ sales — the make-or-break restaurant number.',
  },
  {
    id: 'food_cost', label: 'Food Cost', industries: ['restaurant'],
    compute: (c) => safePct(c.cogs, c.revenue),
    format: pct, benchmark: 'Target 28–35%',
    tooltip: 'Cost of food & beverage ÷ sales (from your cost-of-revenue spend).',
  },
  {
    id: 'labor_cost_rest', label: 'Labor Cost', industries: ['restaurant'],
    compute: (c) => safePct(c.payroll, c.revenue),
    format: pct, benchmark: 'Target ≤ 30%',
    tooltip: 'Payroll ÷ sales.',
  },
  {
    id: 'avg_check', label: 'Average Check', industries: ['restaurant'],
    compute: (c) => (c.orders && c.orders > 0 ? c.revenue / c.orders : null),
    format: money, tooltip: 'Sales ÷ covers.',
    unlock: 'Connect a POS (Toast / Square) for covers',
  },

  // ── Professional services / Agency ────────────────────────────────────────
  {
    id: 'labor_ratio_agency', label: 'Labor Cost Ratio', industries: ['agency'],
    compute: (c) => safePct(c.payroll, c.revenue),
    format: pct, benchmark: 'Target ≤ 50%',
    tooltip: 'Payroll & contractors ÷ revenue — the core lever for a services firm.',
  },
  {
    id: 'gross_margin_agency', label: 'Service Gross Margin', industries: ['agency'],
    compute: (c) => c.grossMargin,
    format: pct, benchmark: 'Target ≥ 50%',
    tooltip: 'Revenue minus delivery cost (subcontractors / pass-through) ÷ revenue.',
  },
  {
    id: 'rev_per_client', label: 'Revenue per Client', industries: ['agency'],
    compute: (c) => (c.customers && c.customers > 0 ? c.revenue / c.customers : null),
    format: money, tooltip: 'Revenue ÷ active clients.',
    unlock: 'Connect Stripe (or a CRM) for client counts',
  },
  {
    id: 'utilization', label: 'Utilization', industries: ['agency'],
    compute: () => null, // needs time-tracking
    format: pct, tooltip: 'Billable hours ÷ available hours.',
    unlock: 'Connect time-tracking (Harvest / Toggl) to unlock',
  },

  // ── Trades / Construction ─────────────────────────────────────────────────
  {
    id: 'job_margin', label: 'Job Gross Margin', industries: ['trades'],
    compute: (c) => c.grossMargin,
    format: pct, benchmark: 'Target ≥ 35%',
    tooltip: 'Revenue minus direct job costs (materials + subs) ÷ revenue.',
  },
  {
    id: 'materials_ratio', label: 'Materials %', industries: ['trades'],
    compute: (c) => safePct(c.cogs, c.revenue),
    format: pct, benchmark: 'Watch the trend',
    tooltip: 'Materials / direct job costs ÷ revenue.',
  },
  {
    id: 'labor_ratio_trades', label: 'Labor & Subs %', industries: ['trades'],
    compute: (c) => safePct(c.payroll, c.revenue),
    format: pct, benchmark: 'Watch the trend',
    tooltip: 'Payroll & subcontractors ÷ revenue.',
  },
  {
    id: 'backlog', label: 'Backlog', industries: ['trades'],
    compute: () => null, // needs job-costing / signed contracts
    format: money, tooltip: 'Signed work not yet billed.',
    unlock: 'Connect job-costing (Jobber / ServiceTitan) to unlock',
  },
]

export { ratio, pct0 } // exported for callers that format derived values

export interface SelectedMetrics {
  visible: { def: MetricDef; value: number }[]
  /** Applicable to this industry but not yet computable (data missing). */
  locked: MetricDef[]
}

/** The industry metrics for a business: those computable now (visible) and those
 *  that apply but need more data (locked, with an unlock hint). */
export function selectMetrics(industry: Industry, ctx: MetricContext): SelectedMetrics {
  const applicable = METRIC_REGISTRY.filter((m) => m.industries.includes(industry))
  const visible: { def: MetricDef; value: number }[] = []
  const locked: MetricDef[] = []
  for (const def of applicable) {
    const v = def.compute(ctx)
    if (v == null || Number.isNaN(v)) locked.push(def)
    else visible.push({ def, value: v })
  }
  return { visible, locked }
}
