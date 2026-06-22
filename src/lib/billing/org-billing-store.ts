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

// ── Multi-entity: a user's own entities = the orgs they OWN ──

/** Number of entities (orgs) a user owns — drives the per-entity overage. */
export async function countOwnedOrgs(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM "Organization" WHERE "userId" = ${userId}`,
  )
  return Number(rows[0]?.n ?? 0)
}

/** The owner's billing-anchor org (the one carrying the plan subscription), if any. */
export async function getOwnerBillingOrg(
  userId: string,
): Promise<{ orgId: string; plan: Plan; subscriptionId: string; customerId: string | null } | null> {
  const rows = await prisma.$queryRaw<Array<{ orgId: string; plan: Plan; subscriptionId: string; customerId: string | null }>>(
    Prisma.sql`
      SELECT "id" AS "orgId", "plan"::text AS plan, "stripeSubscriptionId" AS "subscriptionId", "stripeCustomerId" AS "customerId"
      FROM "Organization"
      WHERE "userId" = ${userId} AND "stripeSubscriptionId" IS NOT NULL
      ORDER BY "createdAt" ASC LIMIT 1
    `,
  )
  return rows[0] ?? null
}

/** The owner's effective plan: the plan of their billing ANCHOR (the org with
 *  the active Stripe subscription) — the single source of truth. Falls back to
 *  the highest owned-org plan only when there is no subscription. */
export async function getOwnerPlan(userId: string): Promise<Plan> {
  // Using the anchor (not the MAX across orgs) prevents a single stray org on a
  // higher tier from inflating the account plan — which previously made every
  // new entity inherit it (e.g. adding a 4th org "upgrading" Pro → CFO Suite).
  const anchor = await getOwnerBillingOrg(userId)
  if (anchor?.plan) return anchor.plan

  const rows = await prisma.$queryRaw<Array<{ plan: Plan }>>(Prisma.sql`
    SELECT "plan"::text AS plan FROM "Organization" WHERE "userId" = ${userId}
  `)
  const rank: Record<string, number> = { STARTER: 0, GROWTH: 1, PRO: 2, CFO: 3 }
  let best: Plan = 'STARTER'
  for (const r of rows) if ((rank[r.plan] ?? 0) >= (rank[best] ?? 0)) best = r.plan
  return best
}

/** Set a new entity's plan to match the owner's (so per-org gating stays consistent). */
export async function setOrgPlanOnly(orgId: string, plan: Plan): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`UPDATE "Organization" SET "plan" = CAST(${plan} AS "Plan"), "updatedAt" = now() WHERE "id" = ${orgId}`)
}
