/**
 * Cross-org community categorization prior (item 4 of the scale plan).
 *
 * Every time a user reclassifies a VENDOR, we record one anonymized vote here:
 * (vendorKey → category). One user fixing "Gusto" teaches the system for every
 * org, permanently, with zero code change — the self-improving loop. We store
 * NO amounts, NO org/user identity, and NO transaction detail (see the
 * VendorCategoryStat model), so the data is safe to pool across customers.
 *
 * Reads return a confidence-weighted prior the resolver consults ONLY when a
 * given org hasn't fixed the vendor itself and the heuristics couldn't name it —
 * it never overrides a user's own choice.
 *
 * Raw SQL so it works without regenerating the Prisma client in CI (mirrors the
 * DecisionLog pattern). Never throws into the request path — categorization must
 * degrade gracefully if the table isn't migrated yet.
 */
import { prisma } from '@/lib/prisma'
import type { CommunityPrior } from './classify'

// Require at least this many total votes for a vendor before we trust the prior,
// so a single mis-click can't propagate a bad category to everyone.
const MIN_VOTES = 2

/** Record one vendor-level vote (anonymized). Fire-and-forget; never blocks. */
export async function recordVendorVote(vendorKey: string, category: string): Promise<void> {
  const vk = vendorKey.trim().toLowerCase()
  if (!vk || !category) return
  try {
    await prisma.$executeRaw`
      INSERT INTO "VendorCategoryStat" ("id", "vendorKey", "category", "count", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${vk}, ${category}, 1, now())
      ON CONFLICT ("vendorKey", "category")
      DO UPDATE SET "count" = "VendorCategoryStat"."count" + 1, "updatedAt" = now()
    `
  } catch (e) {
    console.error('community vote record failed (non-blocking):', e)
  }
}

/**
 * Build the community prior: vendorKey → { category, confidence }, where the
 * category is the plurality winner and confidence is its share of that vendor's
 * total votes. Vendors with fewer than MIN_VOTES total are omitted.
 */
export async function getCommunityPrior(): Promise<CommunityPrior> {
  const prior: CommunityPrior = new Map()
  try {
    const rows = await prisma.$queryRaw<Array<{ vendorKey: string; category: string; count: number | bigint }>>`
      SELECT "vendorKey", "category", "count" FROM "VendorCategoryStat"
    `
    // Aggregate per vendor: total votes + best category.
    const byVendor = new Map<string, { total: number; best: string; bestN: number }>()
    for (const r of rows) {
      const n = Number(r.count)
      const cur = byVendor.get(r.vendorKey) ?? { total: 0, best: r.category, bestN: 0 }
      cur.total += n
      if (n > cur.bestN) { cur.best = r.category; cur.bestN = n }
      byVendor.set(r.vendorKey, cur)
    }
    for (const [vk, v] of byVendor) {
      if (v.total < MIN_VOTES) continue
      prior.set(vk, { category: v.best, confidence: Math.min(1, v.bestN / v.total) })
    }
  } catch (e) {
    // Table may not be migrated yet — degrade to an empty prior.
    console.error('community prior load failed (degrading to none):', e)
  }
  return prior
}
