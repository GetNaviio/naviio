/**
 * Nightly rebuild of the peer-benchmark histograms (vendor spend + category
 * spend-as-%-of-revenue). Recomputes both tables wholesale from live data
 * (idempotent), persisting ONLY aggregates — counts of distinct orgs per bucket.
 * No amounts tied to any org, no org identity. Raw SQL (no generated client).
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { loadPrimaryLedger, monthsAgoUTC, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { detectRecurring } from '@/lib/metrics/recurrence'
import { amountToBucket, ratioToBucket, revenueToSegment } from './buckets'

const SEP = '\n' // safe: vendorKey/category are single-line

type VendorRow = { vendorKey: string; segment: string; bucket: number; orgs: number }
type CategoryRow = { category: string; segment: string; bucket: number; orgs: number }

export async function rebuildVendorBenchmarks(): Promise<{ orgsContributing: number; vendorRows: number; categoryRows: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } })
  const vendorAcc = new Map<string, VendorRow>()
  const catAcc = new Map<string, CategoryRow>()
  let contributing = 0

  for (const { id: orgId } of orgs) {
    const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12)).catch(() => [])
    if (ledger.length === 0) continue
    const overrides = await categoryOverrides(orgId).catch(() => undefined)
    const is = incomeStatement(ledger, undefined, undefined, overrides)
    const segment = revenueToSegment(is.totalIncome)
    let contributed = false

    // Vendor stats — recurring vendors' typical monthly spend.
    for (const [, s] of detectRecurring(ledger)) {
      if (!s.recurring || s.avgAmount <= 0) continue
      const bucket = amountToBucket(s.avgAmount)
      const key = [s.vendorKey, segment, bucket].join(SEP)
      const e = vendorAcc.get(key) ?? { vendorKey: s.vendorKey, segment, bucket, orgs: 0 }
      e.orgs += 1
      vendorAcc.set(key, e)
      contributed = true
    }

    // Category stats — spend as a share of revenue (only when revenue is known).
    if (is.totalIncome > 0) {
      for (const c of is.expensesByCategory) {
        if (c.amount <= 0) continue
        const bucket = ratioToBucket(c.amount / is.totalIncome)
        const key = [c.category, segment, bucket].join(SEP)
        const e = catAcc.get(key) ?? { category: c.category, segment, bucket, orgs: 0 }
        e.orgs += 1
        catAcc.set(key, e)
        contributed = true
      }
    }

    if (contributed) contributing++
  }

  await prisma.$executeRaw`DELETE FROM "VendorSpendStat"`
  await prisma.$executeRaw`DELETE FROM "CategorySpendStat"`
  const CHUNK = 500

  const vEntries = [...vendorAcc.values()]
  for (let i = 0; i < vEntries.length; i += CHUNK) {
    const values = vEntries.slice(i, i + CHUNK).map(
      (e) => Prisma.sql`(${randomUUID()}, ${e.vendorKey}, ${e.segment}, ${e.bucket}, ${e.orgs}, now())`,
    )
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "VendorSpendStat" ("id", "vendorKey", "segment", "bucket", "orgs", "updatedAt") VALUES ${Prisma.join(values)}`)
  }

  const cEntries = [...catAcc.values()]
  for (let i = 0; i < cEntries.length; i += CHUNK) {
    const values = cEntries.slice(i, i + CHUNK).map(
      (e) => Prisma.sql`(${randomUUID()}, ${e.category}, ${e.segment}, ${e.bucket}, ${e.orgs}, now())`,
    )
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "CategorySpendStat" ("id", "category", "segment", "bucket", "orgs", "updatedAt") VALUES ${Prisma.join(values)}`)
  }

  return { orgsContributing: contributing, vendorRows: vEntries.length, categoryRows: cEntries.length }
}
