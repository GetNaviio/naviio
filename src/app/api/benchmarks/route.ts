/**
 * Peer benchmarks for the authenticated org's recurring vendors: how the org's
 * monthly spend compares to similar-size businesses (k-anonymity gated). Returns
 * a map keyed by vendorKey so the Expenses table can show a "vs peers" chip.
 */
import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { loadPrimaryLedger, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement } from '@/lib/metrics/compute'
import { detectRecurring } from '@/lib/metrics/recurrence'
import { revenueToSegment, segmentLabel } from '@/lib/benchmarks/buckets'
import { getVendorBenchmarks } from '@/lib/benchmarks/read'

export async function GET() {
  let user
  try { user = await requireAuth() } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const orgId = await getDefaultOrgId(user.id)
    const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
    const segment = revenueToSegment(incomeStatement(ledger).totalIncome)

    // The org's recurring vendors and their typical monthly spend.
    const mine = new Map<string, number>() // vendorKey -> monthly
    for (const [, s] of detectRecurring(ledger)) {
      if (s.recurring && s.avgAmount > 0) mine.set(s.vendorKey, s.avgAmount)
    }

    const benchmarks = await getVendorBenchmarks([...mine.keys()], segment)
    const vendors: Record<string, { yourMonthly: number; peerMedian: number; p25: number; p75: number; ratio: number; orgs: number }> = {}
    for (const [vk, b] of benchmarks) {
      const yourMonthly = mine.get(vk) ?? 0
      vendors[vk] = {
        yourMonthly: Math.round(yourMonthly),
        peerMedian: b.median, p25: b.p25, p75: b.p75, orgs: b.orgs,
        ratio: b.median > 0 ? Math.round((yourMonthly / b.median) * 100) / 100 : 1,
      }
    }
    return Response.json({ segment, segmentLabel: segmentLabel(segment), vendors })
  } catch (e) {
    console.error('benchmarks read failed:', e)
    return Response.json({ vendors: {} })
  }
}
