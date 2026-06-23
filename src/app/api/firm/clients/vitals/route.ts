import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { withAuth } from '@/lib/api/with-org'
import { getFirmIdForUser } from '@/lib/firm/roles'
import { listFirmClients } from '@/lib/firm/firm'
import { getRole } from '@/lib/firm/access'
import { loadPrimaryLedger, startOfYearUTC, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'
import { getCommunityPrior } from '@/lib/metrics/community'
import { deriveVitals, type ClientStatus } from '@/lib/firm/vitals'
import type { Industry } from '@/lib/metrics/industry'

// Per-client Plaid balance is a live call — cap it so one slow client can't stall
// the whole roster (all clients run in parallel, so this is the worst-case wait).
const CASH_TIMEOUT_MS = 5000

interface ClientVitals {
  orgId: string
  orgName: string
  clientEmail: string | null
  industry: Industry
  cash: number | null
  runwayMonths: number | 'infinity' | null // 'infinity' = cash-positive (JSON-safe)
  netMargin: number | null
  revenueGrowth: number | null
  score: number | null
  status: ClientStatus
  alerts: string[]
  connectedSources: number
  lastSyncedAt: Date | null
}

/**
 * Fractional-CFO portfolio vitals: one compact health read per client org the
 * advisor manages — cash, runway, net margin, MoM revenue, an industry-graded
 * Navi score, a triage status, and the reasons a client needs attention.
 */
export const GET = withAuth(async (_req, { user }) => {
  const firmId = await getFirmIdForUser(user.id)
  if (!firmId) {
    return Response.json({ firm: null, clients: [], rollup: emptyRollup(), alerts: [] })
  }

  const key = `firm:${firmId}:vitals`
  const cached = await cache.get<unknown>(key)
  if (cached) return Response.json(cached)

  const [clients, community] = await Promise.all([listFirmClients(firmId), getCommunityPrior()])

  const vitals: ClientVitals[] = await Promise.all(
    clients.map(async (c): Promise<ClientVitals> => {
      const base = {
        orgId: c.orgId, orgName: c.orgName, clientEmail: c.clientEmail,
        connectedSources: c.connectedSources, lastSyncedAt: c.lastSyncedAt,
      }
      try {
        // firmId is an org link, NOT an auth grant — re-verify access per client
        // (a client who revoked the advisor leaves a dangling firmId).
        const hasAccess = (await getRole(c.orgId, user.id)) != null
        let industry: Industry = 'generic'
        let cash: number | null = null
        let runway: number | null = null
        let netMargin: number | null = null
        let revenueGrowth: number | null = null
        let hasData = false

        if (hasAccess && c.connectedSources > 0) {
          const indRows = await prisma
            .$queryRaw<{ industry: string | null }[]>(Prisma.sql`SELECT "industry" FROM "Organization" WHERE "id" = ${c.orgId} LIMIT 1`)
            .catch(() => [] as { industry: string | null }[])
          industry = (indRows[0]?.industry as Industry) ?? 'generic'

          const ledger = await loadPrimaryLedger(c.orgId, monthsAgoUTC(12))
          const is = incomeStatement(ledger, startOfYearUTC(), undefined, undefined, community)
          const cf = cashFlow(ledger)
          netMargin = is.netMargin
          // MoM revenue growth from the income statement's monthly series,
          // excluding the partial current month.
          const complete = is.byMonth.length > 1 ? is.byMonth.slice(0, -1) : is.byMonth
          const lm = complete[complete.length - 1], pm = complete[complete.length - 2]
          revenueGrowth = lm && pm && pm.income > 0 ? ((lm.income - pm.income) / pm.income) * 100 : null

          cash = await Promise.race([
            getCashBalance(c.orgId).catch(() => null),
            new Promise<null>((r) => setTimeout(() => r(null), CASH_TIMEOUT_MS)),
          ])
          runway = cash != null && cf.burnRate > 0 ? runwayMonths(cash, cf.burnRate)
                 : cash != null && cf.burnRate <= 0 ? Infinity
                 : null
          hasData = ledger.length > 0 || cash != null
        }

        const d = deriveVitals({ netMargin, revenueGrowth, runwayMonths: runway, industry, hasData, hasAccess })
        return {
          ...base, industry, cash,
          runwayMonths: runway === Infinity ? 'infinity' : runway,
          netMargin, revenueGrowth, score: d.score, status: d.status, alerts: d.alerts,
        }
      } catch {
        return { ...base, industry: 'generic', cash: null, runwayMonths: null, netMargin: null, revenueGrowth: null, score: null, status: 'no_data', alerts: ['Could not load this client right now'] }
      }
    }),
  )

  const rollup = {
    total: vitals.length,
    healthy: vitals.filter((v) => v.status === 'healthy').length,
    watch: vitals.filter((v) => v.status === 'watch').length,
    atRisk: vitals.filter((v) => v.status === 'at_risk').length,
    needsData: vitals.filter((v) => v.status === 'no_data' || v.status === 'needs_reconnect').length,
    totalCash: vitals.reduce((s, v) => s + (typeof v.cash === 'number' ? v.cash : 0), 0),
  }
  // Flatten alerts into a cross-client attention feed, at-risk first.
  const order: Record<ClientStatus, number> = { at_risk: 0, needs_reconnect: 1, watch: 2, no_data: 3, healthy: 4 }
  const alerts = vitals
    .flatMap((v) => v.alerts.map((alert) => ({ orgId: v.orgId, orgName: v.orgName, alert, status: v.status })))
    .sort((a, b) => order[a.status] - order[b.status])

  const payload = { firm: { id: firmId }, clients: vitals, rollup, alerts }
  await cache.set(key, payload, cache.TTL.MEDIUM)
  return Response.json(payload)
})

function emptyRollup() {
  return { total: 0, healthy: 0, watch: 0, atRisk: 0, needsData: 0, totalCash: 0 }
}
