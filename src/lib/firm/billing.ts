/**
 * Fractional-CFO billing model — the two go-to-market plans. Pure functions
 * (no I/O) so the math is unit-testable and the same numbers drive the UI, the
 * API estimate, and the Stripe subscription quantities.
 *
 * Option 1 — white_label: the firm pays Naviio and absorbs the cost (does not
 *   charge clients). $799 base for up to 10 client orgs, $59/org beyond 10.
 *
 * Option 2 — white_label_saas: the firm resells Naviio to its clients. $997 base
 *   for up to 25 client orgs. Clients pay through Naviio's Stripe Connect, and
 *   Naviio keeps a 15% commission (application fee); the firm receives the rest.
 *
 * All money is in integer cents.
 */
export type FirmPlan = 'white_label' | 'white_label_saas'
export type BillingCycle = 'monthly' | 'annual'

/** Annual = pay for 10 months, get 12 (~17% off, "2 months free"). */
export const ANNUAL_MONTHS_CHARGED = 10

export interface PlanDef {
  id: FirmPlan
  label: string
  baseFeeCents: number // monthly
  annualBaseFeeCents: number // billed once per year
  includedOrgs: number
  overagePerOrgCents: number // monthly
  annualOveragePerOrgCents: number // per org, per year
  /** Naviio's commission on client payments (Option 2 only). 0 for Option 1. */
  commissionPct: number
  chargesClients: boolean
}

function planDef(
  id: FirmPlan,
  label: string,
  baseMonthly: number,
  includedOrgs: number,
  overageMonthly: number,
  commissionPct: number,
  chargesClients: boolean,
): PlanDef {
  return {
    id,
    label,
    baseFeeCents: baseMonthly,
    annualBaseFeeCents: baseMonthly * ANNUAL_MONTHS_CHARGED,
    includedOrgs,
    overagePerOrgCents: overageMonthly,
    annualOveragePerOrgCents: overageMonthly * ANNUAL_MONTHS_CHARGED,
    commissionPct,
    chargesClients,
  }
}

export const PLANS: Record<FirmPlan, PlanDef> = {
  // Option 1 — $799/mo, 10 orgs, $59/org overage, firm absorbs cost.
  white_label: planDef('white_label', 'White-label', 79_900, 10, 5_900, 0, false),
  // Option 2 — $997/mo, 25 orgs, $59/org overage, 15% commission on resale.
  white_label_saas: planDef('white_label_saas', 'White-label + SaaS resale', 99_700, 25, 5_900, 15, true),
}

export function getPlan(plan: FirmPlan | string): PlanDef {
  return PLANS[(plan as FirmPlan)] ?? PLANS.white_label
}

export interface FirmBill {
  plan: FirmPlan
  cycle: BillingCycle
  orgCount: number
  includedOrgs: number
  baseFeeCents: number
  overageOrgs: number
  overageCents: number
  /** Total billed to the firm this cycle (base + overage). */
  platformDueCents: number
  /** Normalized to a per-month figure for apples-to-apples display. */
  effectiveMonthlyCents: number
  commissionPct: number
}

/** What Naviio bills the firm directly (the platform subscription). */
export function computeFirmBill(
  plan: FirmPlan | string,
  orgCount: number,
  cycle: BillingCycle = 'monthly',
): FirmBill {
  const p = getPlan(plan)
  const overageOrgs = Math.max(0, orgCount - p.includedOrgs)
  const annual = cycle === 'annual'
  const base = annual ? p.annualBaseFeeCents : p.baseFeeCents
  const perOrg = annual ? p.annualOveragePerOrgCents : p.overagePerOrgCents
  const overageCents = overageOrgs * perOrg
  const platformDueCents = base + overageCents
  return {
    plan: p.id,
    cycle,
    orgCount,
    includedOrgs: p.includedOrgs,
    baseFeeCents: base,
    overageOrgs,
    overageCents,
    platformDueCents,
    effectiveMonthlyCents: annual ? Math.round(platformDueCents / 12) : platformDueCents,
    commissionPct: p.commissionPct,
  }
}

/**
 * Naviio's commission (application fee) on a single client payment, in cents.
 * Option 1 returns 0 (the firm doesn't charge clients through Naviio).
 */
export function commissionCents(plan: FirmPlan | string, clientPaymentCents: number): number {
  const p = getPlan(plan)
  return Math.round((clientPaymentCents * p.commissionPct) / 100)
}

/**
 * Full split for an Option-2 firm in a month: what Naviio earns (platform bill +
 * commission across all client payments) and what the firm keeps.
 */
export function monthlySplit(
  plan: FirmPlan | string,
  orgCount: number,
  clientPaymentsCents: number[],
): { naviioPlatformCents: number; naviioCommissionCents: number; naviioTotalCents: number; firmNetCents: number } {
  const p = getPlan(plan)
  const bill = computeFirmBill(p.id, orgCount)
  const grossResale = clientPaymentsCents.reduce((s, c) => s + c, 0)
  const naviioCommission = Math.round((grossResale * p.commissionPct) / 100)
  const naviioTotal = bill.platformDueCents + naviioCommission
  // Firm keeps resale minus commission, minus the platform fee they pay Naviio.
  const firmNet = grossResale - naviioCommission - bill.platformDueCents
  return {
    naviioPlatformCents: bill.platformDueCents,
    naviioCommissionCents: naviioCommission,
    naviioTotalCents: naviioTotal,
    firmNetCents: firmNet,
  }
}

export const fmtUSD = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
