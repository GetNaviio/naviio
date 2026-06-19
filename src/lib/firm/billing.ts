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

export interface PlanDef {
  id: FirmPlan
  label: string
  baseFeeCents: number
  includedOrgs: number
  overagePerOrgCents: number
  /** Naviio's commission on client payments (Option 2 only). 0 for Option 1. */
  commissionPct: number
  chargesClients: boolean
}

export const PLANS: Record<FirmPlan, PlanDef> = {
  white_label: {
    id: 'white_label',
    label: 'White-label',
    baseFeeCents: 79_900, // $799
    includedOrgs: 10,
    overagePerOrgCents: 5_900, // $59/org after 10
    commissionPct: 0,
    chargesClients: false,
  },
  white_label_saas: {
    id: 'white_label_saas',
    label: 'White-label + SaaS resale',
    baseFeeCents: 99_700, // $997
    includedOrgs: 25,
    overagePerOrgCents: 5_900, // $59/org after 25 (same marginal rate)
    commissionPct: 15,
    chargesClients: true,
  },
}

export function getPlan(plan: FirmPlan | string): PlanDef {
  return PLANS[(plan as FirmPlan)] ?? PLANS.white_label
}

export interface FirmBill {
  plan: FirmPlan
  orgCount: number
  includedOrgs: number
  baseFeeCents: number
  overageOrgs: number
  overageCents: number
  /** Platform subscription billed to the firm (base + overage). */
  platformDueCents: number
  commissionPct: number
}

/** What Naviio bills the firm directly (the platform subscription). */
export function computeFirmBill(plan: FirmPlan | string, orgCount: number): FirmBill {
  const p = getPlan(plan)
  const overageOrgs = Math.max(0, orgCount - p.includedOrgs)
  const overageCents = overageOrgs * p.overagePerOrgCents
  return {
    plan: p.id,
    orgCount,
    includedOrgs: p.includedOrgs,
    baseFeeCents: p.baseFeeCents,
    overageOrgs,
    overageCents,
    platformDueCents: p.baseFeeCents + overageCents,
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
