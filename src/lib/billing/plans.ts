/**
 * Individual (direct-to-customer) plan pricing — what an org pays Naviio for its
 * own subscription, distinct from the fractional-CFO firm plans (lib/firm/*).
 *
 * Plans match the marketing pricing page and the Plan enum (STARTER/GROWTH/PRO/CFO).
 * Annual = pay for 10 months (2 months free). All money in integer cents.
 */
import type { Plan } from '@prisma/client'

export type BillingCycle = 'monthly' | 'annual'
export const ANNUAL_MONTHS_CHARGED = 10

export interface PlanPricing {
  id: Plan
  label: string
  monthlyCents: number
  annualCents: number
  seats: number // POSITIVE_INFINITY for CFO
  blurb: string
  /** Self-serve via the in-app plan picker. CFO is NOT — that audience uses the
   *  fractional-CFO firm plans (lib/firm/*), so it isn't duplicated here. */
  selfServe: boolean
}

function p(id: Plan, label: string, monthly: number, seats: number, blurb: string, selfServe = true): PlanPricing {
  return { id, label, monthlyCents: monthly, annualCents: monthly * ANNUAL_MONTHS_CHARGED, seats, blurb, selfServe }
}

// Order matters for the UI (cheapest → priciest).
export const PLAN_PRICING: PlanPricing[] = [
  p('STARTER', 'Starter', 4_900, 1, 'Real-time P&L, cash dashboard, and basic KPIs for solo founders.'),
  p('GROWTH', 'Growth', 14_900, 3, 'Full dashboard, forecasting, and AI categorization for growing SMBs.'),
  p('PRO', 'Pro', 39_900, 10, 'Scenario modeling, board reports, and API access for scaling teams.'),
  // CFO Suite is delivered by the firm plans (white-label / SaaS resale) — see
  // the Clients page. Kept here for label/seats/back-compat, but not self-serve.
  p('CFO', 'CFO Suite', 79_900, Number.POSITIVE_INFINITY, 'Multi-entity, white-label, and a client portal for fractional CFOs.', false),
]

/** Plans offered in the in-app upgrade picker (excludes CFO → firm plans). */
export const SELF_SERVE_PLANS: PlanPricing[] = PLAN_PRICING.filter((x) => x.selfServe)

export const PLAN_BY_ID: Record<string, PlanPricing> = Object.fromEntries(PLAN_PRICING.map((x) => [x.id, x]))

export function planPrice(plan: Plan | string, cycle: BillingCycle): number {
  const def = PLAN_BY_ID[plan]
  if (!def) return 0
  return cycle === 'annual' ? def.annualCents : def.monthlyCents
}

export const fmtUSD = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`
