/**
 * Monthly snapshot of the vendor peer-median (per size band) so we can show how
 * peers' prices for a vendor trend over time. Snapshots accrue from the day this
 * runs — like the MRR snapshots, the trend only appears once a few months exist.
 * Raw SQL (no generated client needed).
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { K_ANON, percentileValue } from './buckets'

/** Snapshot the current vendor peer-medians for `period` (YYYY-MM). Upsert, so a
 *  daily run keeps the current month fresh and ends on its final value. */
export async function snapshotVendorBenchmarks(period: string): Promise<{ rows: number }> {
  const rows = await prisma.$queryRaw<Array<{ vendorKey: string; segment: string; bucket: number; orgs: number }>>(
    Prisma.sql`SELECT "vendorKey", "segment", "bucket", "orgs" FROM "VendorSpendStat"`,
  )
  // Group → median per (vendorKey, segment) that clears k-anon.
  const groups = new Map<string, { vendorKey: string; segment: string; buckets: { bucket: number; orgs: number }[] }>()
  for (const r of rows) {
    const key = `${r.vendorKey}\n${r.segment}`
    const g = groups.get(key) ?? { vendorKey: r.vendorKey, segment: r.segment, buckets: [] }
    g.buckets.push({ bucket: Number(r.bucket), orgs: Number(r.orgs) })
    groups.set(key, g)
  }
  let written = 0
  for (const g of groups.values()) {
    const orgs = g.buckets.reduce((s, b) => s + b.orgs, 0)
    if (orgs < K_ANON) continue
    const median = percentileValue(g.buckets, 0.5)
    if (median == null) continue
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "VendorBenchmarkSnapshot" ("id", "vendorKey", "segment", "period", "median", "orgs", "createdAt")
      VALUES (${randomUUID()}, ${g.vendorKey}, ${g.segment}, ${period}, ${Math.round(median)}, ${orgs}, now())
      ON CONFLICT ("vendorKey", "segment", "period")
      DO UPDATE SET "median" = EXCLUDED."median", "orgs" = EXCLUDED."orgs", "createdAt" = now()
    `).catch((e: unknown) => console.error('snapshot upsert failed:', e))
    written++
  }
  return { rows: written }
}

/** Peer-price trend (%) for vendors in a segment: latest snapshot vs the oldest
 *  snapshot within the last ~12 months that is at least ~3 months back. Null when
 *  there isn't enough history. */
export async function getVendorTrends(vendorKeys: string[], segment: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const keys = [...new Set(vendorKeys.filter(Boolean))]
  if (keys.length === 0) return out
  try {
    const rows = await prisma.$queryRaw<Array<{ vendorKey: string; period: string; median: number }>>(
      Prisma.sql`SELECT "vendorKey", "period", "median" FROM "VendorBenchmarkSnapshot" WHERE "segment" = ${segment} AND "vendorKey" IN (${Prisma.join(keys)}) ORDER BY "period" ASC`,
    )
    const byVendor = new Map<string, { period: string; median: number }[]>()
    for (const r of rows) {
      const list = byVendor.get(r.vendorKey) ?? []
      list.push({ period: r.period, median: Number(r.median) })
      byVendor.set(r.vendorKey, list)
    }
    const now = new Date()
    const minBack = `${new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 7)}` // >= 3 months old
    for (const [vk, snaps] of byVendor) {
      if (snaps.length < 2) continue
      const latest = snaps[snaps.length - 1]
      const baseline = snaps.find((s) => s.period <= minBack) // oldest within window that's >=3mo back
      if (!baseline || baseline.median <= 0 || baseline.period === latest.period) continue
      out.set(vk, Math.round(((latest.median - baseline.median) / baseline.median) * 1000) / 10)
    }
  } catch (e) {
    console.error('vendor trend read failed:', e)
  }
  return out
}

/** Current period as YYYY-MM (UTC). */
export const currentPeriod = (d = new Date()): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
