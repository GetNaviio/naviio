import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { getBalance } from '@/lib/credits/account'

/**
 * Credit usage history for the signed-in org — the append-only ledger behind
 * the balance, newest first. Powers the billing page's activity table so a
 * customer can see exactly what each charge and top-up was for.
 *
 * `?limit=` (default 50, max 200). Returns the live balance too so the page
 * can render both from one round-trip.
 */
export const GET = withOrg(async (request, { orgId }) => {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

  const [balance, rows] = await Promise.all([
    getBalance(orgId),
    prisma.creditLedgerEntry.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, delta: true, balanceAfter: true, reason: true,
        feature: true, stripeRef: true, createdAt: true,
      },
    }),
  ])

  const entries = rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    balanceAfter: r.balanceAfter,
    reason: r.reason,
    feature: r.feature,
    // Never expose the raw Stripe id — just whether this was a paid purchase.
    isPurchase: !!r.stripeRef,
    createdAt: r.createdAt.toISOString(),
  }))

  return Response.json({ balance, entries })
})
