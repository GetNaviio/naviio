/**
 * Ad-spend validation for one bank transaction: detect the platform from the
 * descriptor, reconcile the charge against platform-reported daily spend, and
 * return the KPIs for that exact billing window. Powers the hover popover on
 * the Expenses transactions table.
 *
 * Response contract (all org-scoped):
 *  - { platform: null }                          → not an ad charge
 *  - { platform, connected: false }              → ad charge, platform not linked (CTA)
 *  - { platform, connected: true, match, kpis }  → the validation payload
 */
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { detectAdPlatform, matchCharge, deriveKpis, dayOf, addDays } from '@/lib/ads/match'

export const GET = withOrg(async (request, { orgId }) => {
  const txnId = new URL(request.url).searchParams.get('txnId')
  if (!txnId) return Response.json({ error: 'txnId is required' }, { status: 400 })

  // Org-scoped — never another tenant's transaction.
  const txn = await prisma.transaction.findFirst({
    where: { id: txnId, orgId },
    select: { id: true, date: true, amount: true, description: true, merchantName: true },
  })
  if (!txn) return Response.json({ error: 'Transaction not found' }, { status: 404 })

  const platform = detectAdPlatform(txn.description, txn.merchantName)
  if (!platform) return Response.json({ platform: null })

  const integration = await prisma.integration.findFirst({
    where: { orgId, provider: platform, status: 'CONNECTED' },
    select: { lastSyncedAt: true },
  })
  if (!integration) {
    return Response.json({ platform, connected: false })
  }

  // Window generously covers the longest billing span + posting lag.
  const chargeDay = dayOf(txn.date)
  const rows = await prisma.adInsight.findMany({
    where: { orgId, provider: platform, date: { gte: addDays(chargeDay, -45), lte: chargeDay } },
    orderBy: { date: 'asc' },
  })

  const match = matchCharge(txn.amount, chargeDay, rows)
  const kpis = deriveKpis(match.totals)

  return Response.json({
    platform,
    connected: true,
    charge: { amount: txn.amount, date: chargeDay },
    match: {
      matched: match.matched,
      basis: match.basis,
      from: match.from,
      to: match.to,
      days: match.days,
      platformSpend: match.platformSpend,
      delta: match.delta,
      accountName: match.accountName,
    },
    totals: match.totals,
    kpis,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
  })
})
