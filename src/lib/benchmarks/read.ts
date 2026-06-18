/**
 * Read side of peer benchmarks. Returns distributions only, and only when a
 * (vendor, segment) cohort clears k-anonymity (K_ANON distinct orgs). Raw SQL so
 * it works without regenerating the Prisma client in CI.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { loadPrimaryLedger, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { K_ANON, percentileValue, ratioPercentilePct, revenueToSegment, type SizeBand } from './buckets'

export interface VendorBenchmark { median: number; p25: number; p75: number; orgs: number }
export interface CategoryBenchmark { medianPct: number; p25Pct: number; p75Pct: number; orgs: number }

/** The org's size band, from trailing-12-month revenue. */
export async function getOrgSegment(orgId: string): Promise<SizeBand> {
  const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
  return revenueToSegment(incomeStatement(ledger).totalIncome)
}

/** Peer benchmarks for a set of vendors within one segment (k-anon gated). */
export async function getVendorBenchmarks(vendorKeys: string[], segment: string): Promise<Map<string, VendorBenchmark>> {
  const out = new Map<string, VendorBenchmark>()
  const keys = [...new Set(vendorKeys.filter(Boolean))]
  if (keys.length === 0) return out
  try {
    const rows = await prisma.$queryRaw<Array<{ vendorKey: string; bucket: number; orgs: number }>>(
      Prisma.sql`SELECT "vendorKey", "bucket", "orgs" FROM "VendorSpendStat" WHERE "segment" = ${segment} AND "vendorKey" IN (${Prisma.join(keys)})`,
    )
    const byVendor = new Map<string, { bucket: number; orgs: number }[]>()
    for (const r of rows) {
      const list = byVendor.get(r.vendorKey) ?? []
      list.push({ bucket: Number(r.bucket), orgs: Number(r.orgs) })
      byVendor.set(r.vendorKey, list)
    }
    for (const [vk, buckets] of byVendor) {
      const orgs = buckets.reduce((s, b) => s + b.orgs, 0)
      if (orgs < K_ANON) continue // privacy gate
      const median = percentileValue(buckets, 0.5)
      if (median == null) continue
      out.set(vk, { median, p25: percentileValue(buckets, 0.25) ?? median, p75: percentileValue(buckets, 0.75) ?? median, orgs })
    }
  } catch (e) {
    console.error('vendor benchmark read failed (degrading to none):', e)
  }
  return out
}

/** Category spend-as-%-of-revenue benchmarks for a segment (k-anon gated). */
export async function getCategoryBenchmarks(segment: string): Promise<Map<string, CategoryBenchmark>> {
  const out = new Map<string, CategoryBenchmark>()
  try {
    const rows = await prisma.$queryRaw<Array<{ category: string; bucket: number; orgs: number }>>(
      Prisma.sql`SELECT "category", "bucket", "orgs" FROM "CategorySpendStat" WHERE "segment" = ${segment}`,
    )
    const byCat = new Map<string, { bucket: number; orgs: number }[]>()
    for (const r of rows) {
      const list = byCat.get(r.category) ?? []
      list.push({ bucket: Number(r.bucket), orgs: Number(r.orgs) })
      byCat.set(r.category, list)
    }
    for (const [cat, buckets] of byCat) {
      const orgs = buckets.reduce((s, b) => s + b.orgs, 0)
      if (orgs < K_ANON) continue
      const medianPct = ratioPercentilePct(buckets, 0.5)
      if (medianPct == null) continue
      out.set(cat, { medianPct, p25Pct: ratioPercentilePct(buckets, 0.25) ?? medianPct, p75Pct: ratioPercentilePct(buckets, 0.75) ?? medianPct, orgs })
    }
  } catch (e) {
    console.error('category benchmark read failed (degrading to none):', e)
  }
  return out
}
