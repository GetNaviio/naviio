/**
 * Peer benchmarks for the authenticated org's recurring vendors: how the org's
 * monthly spend compares to similar-size businesses (k-anonymity gated). Returns
 * a map keyed by vendorKey so the Expenses table can show a "vs peers" chip.
 */
import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { loadPrimaryLedger, monthsAgoUTC, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { detectRecurring } from '@/lib/metrics/recurrence'
import { revenueToSegment, segmentLabel } from '@/lib/benchmarks/buckets'
import { getVendorBenchmarks, getCategoryBenchmarks } from '@/lib/benchmarks/read'
import { getVendorTrends } from '@/lib/benchmarks/snapshot'

export async function GET() {
  let user
  try { user = await requireAuth() } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const orgId = await getDefaultOrgId(user.id)
    const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
    const overrides = await categoryOverrides(orgId).catch(() => undefined)
    const is = incomeStatement(ledger, undefined, undefined, overrides)
    const segment = revenueToSegment(is.totalIncome)

    // The org's recurring vendors and their typical monthly spend.
    const mine = new Map<string, number>() // vendorKey -> monthly
    for (const [, s] of detectRecurring(ledger)) {
      if (s.recurring && s.avgAmount > 0) mine.set(s.vendorKey, s.avgAmount)
    }

    const [benchmarks, catBenchmarks, trends] = await Promise.all([
      getVendorBenchmarks([...mine.keys()], segment),
      getCategoryBenchmarks(segment),
      getVendorTrends([...mine.keys()], segment),
    ])
    const vendors: Record<string, { yourMonthly: number; peerMedian: number; p25: number; p75: number; ratio: number; orgs: number; peerTrendPct: number | null }> = {}
    for (const [vk, b] of benchmarks) {
      const yourMonthly = mine.get(vk) ?? 0
      vendors[vk] = {
        yourMonthly: Math.round(yourMonthly),
        peerMedian: b.median, p25: b.p25, p75: b.p75, orgs: b.orgs,
        ratio: b.median > 0 ? Math.round((yourMonthly / b.median) * 100) / 100 : 1,
        peerTrendPct: trends.get(vk) ?? null,
      }
    }

    // Category spend-as-%-of-revenue vs peers.
    const categories: Array<{ category: string; yourPct: number; peerMedianPct: number; ratio: number; orgs: number }> = []
    if (is.totalIncome > 0) {
      for (const c of is.expensesByCategory) {
        const b = catBenchmarks.get(c.category)
        if (!b) continue
        const yourPct = Math.round((c.amount / is.totalIncome) * 1000) / 10
        categories.push({
          category: c.category, yourPct, peerMedianPct: b.medianPct, orgs: b.orgs,
          ratio: b.medianPct > 0 ? Math.round((yourPct / b.medianPct) * 100) / 100 : 1,
        })
      }
      // Most over-peer first.
      categories.sort((a, b) => b.ratio - a.ratio)
    }

    return Response.json({ segment, segmentLabel: segmentLabel(segment), vendors, categories })
  } catch (e) {
    console.error('benchmarks read failed:', e)
    return Response.json({ vendors: {}, categories: [] })
  }
}
