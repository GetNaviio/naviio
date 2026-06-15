import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mrrWaterfall, nrr, grr, cohortRetention, type SubMrr, type CohortRow } from '@/lib/metrics/mrr'

/**
 * MRR movement (waterfall + NRR/GRR) for the latest two captured periods, plus
 * cohort retention — all from MrrSnapshot history. Returns `periods` so the UI
 * can show a "building history" state until at least two months exist.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const distinct = await prisma.mrrSnapshot.findMany({
      where: { orgId },
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'desc' },
    })
    const periods = distinct.map((d) => d.period)

    if (periods.length < 2) {
      return Response.json({ periods: periods.length, waterfall: null, nrr: null, grr: null, cohorts: [] })
    }

    const [curr, prev] = [periods[0], periods[1]]
    const rows = await prisma.mrrSnapshot.findMany({
      where: { orgId, period: { in: [curr, prev] } },
      select: { period: true, subscriptionId: true, mrr: true, cohortMonth: true },
    })

    // Only paying rows (mrr > 0) count as "present" — so a subscription that
    // dropped to 0 MRR (canceled) is treated as churned, not contraction.
    const toSub = (period: string): SubMrr[] =>
      rows.filter((r) => r.period === period && r.mrr > 0).map((r) => ({ subscriptionId: r.subscriptionId, mrr: r.mrr }))

    const w = mrrWaterfall(toSub(prev), toSub(curr))

    // Cohort retention uses the full snapshot history.
    const all = await prisma.mrrSnapshot.findMany({
      where: { orgId },
      select: { period: true, cohortMonth: true, mrr: true },
    })
    const cohorts = cohortRetention(all as CohortRow[])

    return Response.json({
      periods: periods.length,
      current: curr,
      previous: prev,
      waterfall: w,
      nrr: nrr(w),
      grr: grr(w),
      cohorts,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ periods: 0, waterfall: null, nrr: null, grr: null, cohorts: [] })
  }
}
