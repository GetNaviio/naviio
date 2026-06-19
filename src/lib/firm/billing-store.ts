/**
 * Firm billing persistence (raw SQL — no Prisma regeneration needed). Reads/writes
 * the billing columns on Firm and sets a firm's plan to the canonical defaults.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { PLANS, type FirmPlan } from '@/lib/firm/billing'

export interface FirmBilling {
  id: string
  plan: FirmPlan
  baseFeeCents: number
  includedOrgs: number
  overagePerOrgCents: number
  commissionPct: number
  stripeConnectAccountId: string | null
  connectStatus: string
}

export async function getFirmBilling(firmId: string): Promise<FirmBilling | null> {
  const rows = await prisma.$queryRaw<FirmBilling[]>(Prisma.sql`
    SELECT "id", "plan", "baseFeeCents", "includedOrgs", "overagePerOrgCents",
           "commissionPct", "stripeConnectAccountId", "connectStatus"
    FROM "Firm" WHERE "id" = ${firmId} LIMIT 1
  `)
  return rows[0] ?? null
}

/** Switch a firm to a plan, writing the plan's canonical pricing onto the firm. */
export async function setFirmPlan(firmId: string, plan: FirmPlan): Promise<void> {
  const p = PLANS[plan]
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Firm" SET
      "plan" = ${p.id},
      "baseFeeCents" = ${p.baseFeeCents},
      "includedOrgs" = ${p.includedOrgs},
      "overagePerOrgCents" = ${p.overagePerOrgCents},
      "commissionPct" = ${p.commissionPct},
      "updatedAt" = now()
    WHERE "id" = ${firmId}
  `)
}

export async function setFirmConnect(firmId: string, accountId: string, status: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Firm" SET "stripeConnectAccountId" = ${accountId}, "connectStatus" = ${status}, "updatedAt" = now()
    WHERE "id" = ${firmId}
  `)
}

/** Count of client orgs linked to a firm (drives overage). */
export async function countFirmOrgs(firmId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM "Organization" WHERE "firmId" = ${firmId}`,
  )
  return Number(rows[0]?.n ?? 0)
}
