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

/** Per-entity overage beyond a plan's included entities (multi-entity businesses). */
export const ENTITY_OVERAGE_CENTS = 9_900 // $99/entity/mo (annual = ×10)

export interface PlanPricing {
  id: Plan
  label: string
  monthlyCents: number
  annualCents: number
  seats: number // POSITIVE_INFINITY for CFO
  /** Entities (own legal entities / locations) included before per-entity overage. */
  includedEntities: number
  /** Per-entity overage beyond includedEntities (0 = single-entity plan). */
  entityOverageCents: number
  blurb: string
  selfServe: boolean
}

function p(
  id: Plan,
  label: string,
  monthly: number,
  seats: number,
  includedEntities: number,
  entityOverageCents: number,
  blurb: string,
  selfServe = true,
): PlanPricing {
  return {
    id,
    label,
    monthlyCents: monthly,
    annualCents: monthly * ANNUAL_MONTHS_CHARGED,
    seats,
    includedEntities,
    entityOverageCents,
    blurb,
    selfServe,
  }
}

// Order matters for the UI (cheapest → priciest).
export const PLAN_PRICING: PlanPricing[] = [
  // Starter/Growth are single-entity (multi-entity needs Pro+).
  p('STARTER', 'Starter', 4_900, 1, 1, 0, 'Real-time P&L, cash dashboard, and basic KPIs for solo founders.'),
  p('GROWTH', 'Growth', 14_900, 3, 1, 0, 'Full dashboard, forecasting, and AI categorization for growing SMBs.'),
  // Pro: 3 entities, then $99/entity. CFO Suite: 10 entities, then $99/entity.
  p('PRO', 'Pro', 34_900, 10, 3, ENTITY_OVERAGE_CENTS, 'Scenario modeling, board reports, and multi-entity (up to 3 entities, then $99/entity).'),
  p('CFO', 'CFO Suite', 79_900, Number.POSITIVE_INFINITY, 10, ENTITY_OVERAGE_CENTS, 'Multi-entity at scale — up to 10 entities, then $99/entity.'),
]

/** All self-serve plans (CFO Suite is back as the multi-entity tier; the
 *  fractional-CFO FIRM plans live separately in lib/firm with a $59 channel rate). */
export const SELF_SERVE_PLANS: PlanPricing[] = PLAN_PRICING.filter((x) => x.selfServe)

export const PLAN_BY_ID: Record<string, PlanPricing> = Object.fromEntries(PLAN_PRICING.map((x) => [x.id, x]))

/** Plans that support multiple entities (own orgs). Starter/Growth do not. */
export function planAllowsMultiEntity(plan: Plan | string): boolean {
  const def = PLAN_BY_ID[plan]
  return !!def && def.entityOverageCents > 0
}

/** Total monthly cost for `entities` on a plan (base + graduated per-entity overage). */
export function planCostForEntities(plan: Plan | string, entities: number, cycle: BillingCycle = 'monthly'): number {
  const def = PLAN_BY_ID[plan]
  if (!def) return 0
  const base = cycle === 'annual' ? def.annualCents : def.monthlyCents
  const over = Math.max(0, entities - def.includedEntities)
  const perEntity = cycle === 'annual' ? def.entityOverageCents * ANNUAL_MONTHS_CHARGED : def.entityOverageCents
  return base + over * perEntity
}

/** The cheaper multi-entity plan for a given entity count (Pro vs CFO Suite).
 *  Crossover lands at 8 entities ($349 + 5×$99 = $844 > $799). */
export function cheaperPlanForEntities(entities: number): Plan {
  return planCostForEntities('PRO', entities) <= planCostForEntities('CFO', entities) ? 'PRO' : 'CFO'
}

export function planPrice(plan: Plan | string, cycle: BillingCycle): number {
  const def = PLAN_BY_ID[plan]
  if (!def) return 0
  return cycle === 'annual' ? def.annualCents : def.monthlyCents
}

export const fmtUSD = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`
