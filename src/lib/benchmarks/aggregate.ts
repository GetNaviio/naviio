/**
 * Nightly rebuild of the peer-benchmark histogram. Recomputes the whole table
 * from live data (idempotent; an org is never double-counted), and persists ONLY
 * aggregates — counts of distinct orgs per (vendorKey, segment, monthly-$ bucket).
 * No amounts tied to any org, no org identity. Raw SQL (no generated client needed).
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { loadPrimaryLedger, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { detectRecurring } from '@/lib/metrics/recurrence'
import { amountToBucket, revenueToSegment } from './buckets'

const SEP = '\n' // safe: vendorKey is normalized to a single line

export async function rebuildVendorBenchmarks(): Promise<{ orgsContributing: number; rows: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } })

  // (vendorKey, segment, bucket) -> distinct-org count. One recurring stream per
  // vendor per org, so each org contributes at most once per bucket.
  const acc = new Map<string, { vendorKey: string; segment: string; bucket: number; orgs: number }>()
  let contributing = 0

  for (const { id: orgId } of orgs) {
    const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12)).catch(() => [])
    if (ledger.length === 0) continue
    const segment = revenueToSegment(incomeStatement(ledger).totalIncome)
    let contributed = false
    for (const [, s] of detectRecurring(ledger)) {
      if (!s.recurring || s.avgAmount <= 0) continue
      const bucket = amountToBucket(s.avgAmount)
      const key = [s.vendorKey, segment, bucket].join(SEP)
      const e = acc.get(key) ?? { vendorKey: s.vendorKey, segment, bucket, orgs: 0 }
      e.orgs += 1
      acc.set(key, e)
      contributed = true
    }
    if (contributed) contributing++
  }

  // Replace the table wholesale.
  await prisma.$executeRaw`DELETE FROM "VendorSpendStat"`
  const entries = [...acc.values()]
  const CHUNK = 500
  for (let i = 0; i < entries.length; i += CHUNK) {
    const values = entries.slice(i, i + CHUNK).map(
      (e) => Prisma.sql`(${randomUUID()}, ${e.vendorKey}, ${e.segment}, ${e.bucket}, ${e.orgs}, now())`,
    )
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "VendorSpendStat" ("id", "vendorKey", "segment", "bucket", "orgs", "updatedAt") VALUES ${Prisma.join(values)}`,
    )
  }

  return { orgsContributing: contributing, rows: entries.length }
}
