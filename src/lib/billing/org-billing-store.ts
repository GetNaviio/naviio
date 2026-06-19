/**
 * Org plan-billing persistence (raw SQL). Reads/writes the subscription fields on
 * Organization and sets the plan enum. Plan is cast to the Postgres enum type so
 * this needs no Prisma client regeneration.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { Plan } from '@prisma/client'

export interface OrgBilling {
  plan: Plan
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string
}

export async function getOrgBilling(orgId: string): Promise<OrgBilling | null> {
  const rows = await prisma.$queryRaw<OrgBilling[]>(Prisma.sql`
    SELECT "plan"::text AS plan, "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus"
    FROM "Organization" WHERE "id" = ${orgId} LIMIT 1
  `)
  return rows[0] ?? null
}

export async function setOrgPlan(orgId: string, plan: Plan): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Organization" SET "plan" = CAST(${plan} AS "Plan"), "updatedAt" = now() WHERE "id" = ${orgId}
  `)
}

/** After Checkout: persist ids, set the plan, mark active. */
export async function setOrgPlanActive(
  orgId: string,
  plan: Plan,
  customerId: string,
  subscriptionId: string,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Organization" SET
      "plan" = CAST(${plan} AS "Plan"),
      "stripeCustomerId" = ${customerId},
      "stripeSubscriptionId" = ${subscriptionId},
      "subscriptionStatus" = 'active',
      "updatedAt" = now()
    WHERE "id" = ${orgId}
  `)
}

/** Webhook: update status (and optionally plan) by Stripe subscription id. */
export async function setOrgStatusBySubId(subscriptionId: string, status: string, plan?: Plan): Promise<void> {
  if (plan) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Organization" SET "subscriptionStatus" = ${status}, "plan" = CAST(${plan} AS "Plan"), "updatedAt" = now()
      WHERE "stripeSubscriptionId" = ${subscriptionId}
    `)
  } else {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Organization" SET "subscriptionStatus" = ${status}, "updatedAt" = now()
      WHERE "stripeSubscriptionId" = ${subscriptionId}
    `)
  }
}

/** Webhook: subscription canceled → revert to STARTER. */
export async function cancelOrgSubBySubId(subscriptionId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Organization" SET "subscriptionStatus" = 'canceled', "plan" = CAST('STARTER' AS "Plan"), "updatedAt" = now()
    WHERE "stripeSubscriptionId" = ${subscriptionId}
  `)
}
