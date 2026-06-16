/**
 * Fix-the-AI write path: reclassify a transaction. PATCH upserts a user
 * override (display category and/or COGS/OPEX class) keyed by the provider's
 * stable externalId; DELETE resets to the auto-classifier.
 *
 * The read side (categoryOverrides / classificationOverrides in the ledger
 * service) is applied by every consumer, so one fix here moves the
 * transaction in the P&L, Expenses, drill-downs, and the financial model
 * simultaneously — the trust-layer contract.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withOrg } from '@/lib/api/with-org'
import { parseBody } from '@/lib/validate'
import { USER_CATEGORIES, vendorKey } from '@/lib/metrics/classify'
import * as cache from '@/lib/cache'

const PatchSchema = z
  .object({
    externalId: z.string().trim().min(1).max(128),
    category: z.string().trim().min(1).max(60).nullable().optional(),
    expenseClass: z.enum(['COGS', 'OPEX', 'OTHER']).nullable().optional(),
  })
  .refine((b) => b.category !== undefined || b.expenseClass !== undefined, {
    message: 'provide category and/or expenseClass',
  })
  .refine((b) => b.category == null || USER_CATEGORIES.includes(b.category), {
    message: 'unknown category',
    path: ['category'],
  })

export const PATCH = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, PatchSchema)
  if (!parsed.ok) return parsed.response
  const { externalId, category, expenseClass } = parsed.data

  // Only override transactions that actually belong to this org.
  const txn = await prisma.transaction.findFirst({
    where: { orgId, externalId },
    select: { id: true },
  })
  if (!txn) return Response.json({ error: 'Transaction not found' }, { status: 404 })

  const row = await prisma.txnClassification.upsert({
    where: { orgId_externalId: { orgId, externalId } },
    create: { orgId, externalId, category: category ?? null, expenseClass: expenseClass ?? null },
    update: {
      ...(category !== undefined ? { category } : {}),
      ...(expenseClass !== undefined ? { expenseClass } : {}),
    },
  })

  // A row with nothing left to say is noise — remove it.
  if (row.category == null && row.expenseClass == null) {
    await prisma.txnClassification.delete({ where: { id: row.id } })
  }
  // Re-categorizing changes every derived figure (P&L, metrics, model). Bust the
  // org's cached results so the fix shows everywhere immediately — the trust contract.
  await cache.delPattern(`org:${orgId}:*`)
  if (row.category == null && row.expenseClass == null) {
    return Response.json({ override: null })
  }
  return Response.json({ override: { externalId, category: row.category, expenseClass: row.expenseClass } })
})

export const DELETE = withOrg(async (request, { orgId }) => {
  const externalId = new URL(request.url).searchParams.get('externalId')
  if (!externalId) return Response.json({ error: 'externalId is required' }, { status: 400 })

  // Category overrides are vendor-level, so "reset to auto" must clear the
  // override for EVERY transaction of this vendor — not just the clicked row.
  const clicked = await prisma.transaction.findFirst({
    where: { orgId, externalId },
    select: { merchantName: true, description: true },
  })
  if (!clicked) {
    await prisma.txnClassification.deleteMany({ where: { orgId, externalId } })
    await cache.delPattern(`org:${orgId}:*`)
    return Response.json({ success: true })
  }
  const vk = vendorKey(clicked)

  // Find category-override rows whose transaction shares this vendor.
  const overrides = await prisma.txnClassification.findMany({
    where: { orgId, category: { not: null } },
    select: { id: true, externalId: true, expenseClass: true },
  })
  const sibTxns = await prisma.transaction.findMany({
    where: { orgId, externalId: { in: overrides.map((o) => o.externalId) } },
    select: { externalId: true, merchantName: true, description: true },
  })
  const vkByExt = new Map(sibTxns.map((t) => [t.externalId, vendorKey(t)]))
  const targets = overrides.filter((o) => vkByExt.get(o.externalId) === vk)

  // Clear the category; keep any COGS override (delete the row only if empty).
  await prisma.$transaction([
    ...targets.filter((o) => o.expenseClass == null).map((o) => prisma.txnClassification.delete({ where: { id: o.id } })),
    ...targets.filter((o) => o.expenseClass != null).map((o) => prisma.txnClassification.update({ where: { id: o.id }, data: { category: null } })),
  ])
  await cache.delPattern(`org:${orgId}:*`)
  return Response.json({ success: true })
})
