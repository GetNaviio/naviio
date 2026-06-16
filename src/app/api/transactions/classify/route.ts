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
import { USER_CATEGORIES, vendorKey, VENDOR_OVERRIDE_PREFIX } from '@/lib/metrics/classify'
import * as cache from '@/lib/cache'

const PatchSchema = z
  .object({
    externalId: z.string().trim().min(1).max(128),
    category: z.string().trim().min(1).max(60).nullable().optional(),
    expenseClass: z.enum(['COGS', 'OPEX', 'OTHER']).nullable().optional(),
    // Category scope: true (default) = apply to the whole vendor; false = this
    // transaction only (wins over the vendor default). Ignored for expenseClass.
    applyToVendor: z.boolean().optional(),
  })
  .refine((b) => b.category !== undefined || b.expenseClass !== undefined, {
    message: 'provide category and/or expenseClass',
  })
  .refine((b) => b.category == null || USER_CATEGORIES.includes(b.category), {
    message: 'unknown category',
    path: ['category'],
  })

/** Clear a category override row by key — delete it if it carries nothing else. */
async function clearCategoryRow(orgId: string, key: string) {
  const r = await prisma.txnClassification.findUnique({ where: { orgId_externalId: { orgId, externalId: key } }, select: { id: true, expenseClass: true } })
  if (!r) return
  if (r.expenseClass == null) await prisma.txnClassification.delete({ where: { id: r.id } })
  else await prisma.txnClassification.update({ where: { id: r.id }, data: { category: null } })
}

export const PATCH = withOrg(async (request, { orgId }) => {
  const parsed = await parseBody(request, PatchSchema)
  if (!parsed.ok) return parsed.response
  const { externalId, category, expenseClass, applyToVendor = true } = parsed.data

  // Resolve the clicked transaction (and its vendor identity) — must be this org's.
  const txn = await prisma.transaction.findFirst({
    where: { orgId, externalId },
    select: { id: true, merchantName: true, description: true },
  })
  if (!txn) return Response.json({ error: 'Transaction not found' }, { status: 404 })

  // ── Category override (vendor-scoped by default; per-transaction on request) ──
  if (category !== undefined) {
    const vendorRowKey = `${VENDOR_OVERRIDE_PREFIX}${vendorKey(txn)}`
    if (applyToVendor) {
      // Apply to the whole vendor, and clear this row's own pin so it follows.
      await clearCategoryRow(orgId, externalId)
      if (category === null) await clearCategoryRow(orgId, vendorRowKey)
      else await prisma.txnClassification.upsert({
        where: { orgId_externalId: { orgId, externalId: vendorRowKey } },
        create: { orgId, externalId: vendorRowKey, category },
        update: { category },
      })
    } else {
      // Pin just this transaction (wins over the vendor default).
      if (category === null) await clearCategoryRow(orgId, externalId)
      else await prisma.txnClassification.upsert({
        where: { orgId_externalId: { orgId, externalId } },
        create: { orgId, externalId, category },
        update: { category },
      })
    }
  }

  // ── COGS/OpEx override — always per transaction ──
  if (expenseClass !== undefined) {
    if (expenseClass === null) {
      const r = await prisma.txnClassification.findUnique({ where: { orgId_externalId: { orgId, externalId } }, select: { id: true, category: true } })
      if (r) {
        if (r.category == null) await prisma.txnClassification.delete({ where: { id: r.id } })
        else await prisma.txnClassification.update({ where: { id: r.id }, data: { expenseClass: null } })
      }
    } else {
      await prisma.txnClassification.upsert({
        where: { orgId_externalId: { orgId, externalId } },
        create: { orgId, externalId, expenseClass },
        update: { expenseClass },
      })
    }
  }

  // Re-categorizing changes every derived figure (P&L, metrics, model). Bust the
  // org's cache so the fix shows everywhere immediately — the trust contract.
  await cache.delPattern(`org:${orgId}:*`)
  return Response.json({ ok: true })
})

export const DELETE = withOrg(async (request, { orgId }) => {
  const externalId = new URL(request.url).searchParams.get('externalId')
  if (!externalId) return Response.json({ error: 'externalId is required' }, { status: 400 })

  // Reset category to auto: clear the vendor default AND this row's own pin, so
  // the transaction (and its vendor) return to auto-classification. Other
  // deliberate per-transaction pins on the same vendor are left intact.
  const clicked = await prisma.transaction.findFirst({
    where: { orgId, externalId },
    select: { merchantName: true, description: true },
  })
  await clearCategoryRow(orgId, externalId)
  if (clicked) await clearCategoryRow(orgId, `${VENDOR_OVERRIDE_PREFIX}${vendorKey(clicked)}`)
  await cache.delPattern(`org:${orgId}:*`)
  return Response.json({ success: true })
})
