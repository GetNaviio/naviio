/**
 * Multi-entity: create an additional organization (the owner's own entity /
 * location, or a CFO's client). Gated to PRO and CFO plans — Starter/Growth are
 * single-entity. The new entity inherits the owner's plan, and the owner's plan
 * subscription quantity (= entity count) is bumped so the per-entity overage
 * (Pro: $99 beyond 3; CFO: $99 beyond 10) is billed automatically.
 *
 * withAuth, not withOrg — creation is an account-level act, and the new org
 * becomes the active one immediately (the dashboard then opens onboarding).
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { getOwnerPlan, getOwnerBillingOrg, countOwnedOrgs } from '@/lib/billing/org-billing-store'
import { planAllowsMultiEntity } from '@/lib/billing/plans'
import { syncPlanSubscriptionQuantity, isPlanBillingConfigured } from '@/lib/billing/stripe-plans'

const CreateSchema = z.object({ name: z.string().trim().min(2).max(80) })

export const POST = withAuth(async (request, { user }) => {
  const limited = await rateLimit(request, 'org_create', { limit: 10, windowSeconds: 3600 })
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Organization name must be 2–80 characters' }, { status: 400 })
  }

  const ownerPlan = await getOwnerPlan(user.id)
  if (!planAllowsMultiEntity(ownerPlan)) {
    return Response.json(
      { error: 'Multiple entities are a Pro feature — upgrade to add another entity.', code: 'PRO_REQUIRED' },
      { status: 403 },
    )
  }

  // New entity inherits the owner's plan (keeps per-org gating consistent).
  const org = await prisma.organization.create({
    data: { name: parsed.data.name, userId: user.id, plan: ownerPlan },
    select: { id: true, name: true },
  })
  await prisma.user.update({ where: { id: user.id }, data: { activeOrgId: org.id } })

  // Bump the owner's subscription quantity so the per-entity overage bills.
  const anchor = await getOwnerBillingOrg(user.id)
  if (anchor?.subscriptionId && isPlanBillingConfigured()) {
    await syncPlanSubscriptionQuantity(anchor.subscriptionId, await countOwnedOrgs(user.id)).catch(() => {})
  }

  return Response.json({ ok: true, orgId: org.id, name: org.name }, { status: 201 })
})
