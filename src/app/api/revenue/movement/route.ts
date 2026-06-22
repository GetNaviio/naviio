import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mrrWaterfall, nrr, grr, trailingGrossMrrChurn, cohortRetention, type SubMrr, type CohortRow, type Waterfall } from '@/lib/metrics/mrr'

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
      select: { period: true, subscriptionId: true, customerId: true, mrr: true, cohortMonth: true },
    })

    // Only paying rows (mrr > 0) count as "present" — so a subscription that
    // dropped to 0 MRR (canceled) is treated as churned, not contraction.
    // customerId is passed so retention is measured per customer, not per sub.
    const toSub = (period: string): SubMrr[] =>
      rows
        .filter((r) => r.period === period && r.mrr > 0)
        .map((r) => ({ subscriptionId: r.subscriptionId, customerId: r.customerId, mrr: r.mrr }))

    const w = mrrWaterfall(toSub(prev), toSub(curr))

    // Trailing-average gross MRR churn over the last few period-pairs — a single
    // period is too noisy to seed a forecast. Build consecutive-pair waterfalls
    // across up to the last 4 periods (oldest→newest) and average their churn.
    const recentPeriods = periods.slice(0, 4).reverse()
    const trailRows = await prisma.mrrSnapshot.findMany({
      where: { orgId, period: { in: recentPeriods } },
      select: { period: true, subscriptionId: true, customerId: true, mrr: true },
    })
    const subsFor = (period: string): SubMrr[] =>
      trailRows
        .filter((r) => r.period === period && r.mrr > 0)
        .map((r) => ({ subscriptionId: r.subscriptionId, customerId: r.customerId, mrr: r.mrr }))
    const pairWaterfalls: Waterfall[] = []
    for (let i = 1; i < recentPeriods.length; i++) {
      pairWaterfalls.push(mrrWaterfall(subsFor(recentPeriods[i - 1]), subsFor(recentPeriods[i])))
    }
    const trailingChurn = trailingGrossMrrChurn(pairWaterfalls, 3) // percent, or null

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
      trailingChurn,
      cohorts,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ periods: 0, waterfall: null, nrr: null, grr: null, cohorts: [] })
  }
}
