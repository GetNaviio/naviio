import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import * as cache from '@/lib/cache'
import { inferIndustry, type Industry } from '@/lib/metrics/industry'
import { loadPrimaryLedger, startOfYearUTC, ledgerSources, connectedProviders, monthsAgoUTC, categoryOverrides, classificationOverrides } from '@/lib/metrics/ledger'
import { getCommunityPrior } from '@/lib/metrics/community'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { marketingSpend } from '@/lib/metrics/marketing'
import { getCashBalance } from '@/lib/integrations/plaid'

/**
 * Unified live-metrics endpoint — the single source the dashboard tabs read.
 * Everything is computed by our metric engine from the deduplicated transaction
 * ledger (Plaid + Stripe primary). Returns `hasData: false` when nothing is
 * connected so the UI can show connect-prompts instead of demo numbers.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const key = `org:${orgId}:metrics`
    const cached = await cache.get<unknown>(key)
    if (cached) return Response.json(cached)

    // Which integrations are connected (for source labels + connect-prompts).
    const connected = await connectedProviders(orgId)
    const sources = {
      plaid: connected.has('PLAID'),
      stripe: connected.has('STRIPE'),
      quickbooks: connected.has('QUICKBOOKS'),
      xero: connected.has('XERO'),
    }

    // Trailing 13 months of ledger (covers a 12-month series + current month).
    // Source-of-truth hierarchy: Plaid/Stripe rows win; accounting only as fallback.
    const [ledger, catOverrides, community, ecOverrides] = await Promise.all([
      loadPrimaryLedger(orgId, monthsAgoUTC(12)),
      categoryOverrides(orgId), // user category fixes — applied everywhere
      getCommunityPrior(),      // cross-org prior → consistent category breakdown
      classificationOverrides(orgId), // user COGS/OpEx tags → gross-margin split
    ])

    const is = incomeStatement(ledger, startOfYearUTC(), undefined, catOverrides, community, ecOverrides) // YTD income statement (+ gross margin)
    const cf = cashFlow(ledger, undefined, undefined, catOverrides) // trailing cash flow (honors overrides)
    const marketing = { thisMonth: marketingSpend(ledger, monthsAgoUTC(0)) }
    // Cap the live Plaid balance call so a slow provider can't time out the whole
    // endpoint (which would surface as an error on every dashboard tab). On
    // timeout we fall back to null — the page still renders from the ledger.
    const cashBalance = sources.plaid
      ? await Promise.race([
          getCashBalance(orgId).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000)),
        ])
      : null
    const runway = cashBalance != null && cf.burnRate > 0 ? runwayMonths(cashBalance, cf.burnRate) : null

    // Business type: the owner's choice + an inferred suggestion (from the
    // transaction mix + whether recurring revenue exists). Drives which metrics
    // are relevant and which Navi-score dimensions/benchmarks apply.
    // Raw SQL for `industry` (the generated client picks it up after prisma
    // generate on the build host; resilient if the column isn't migrated yet).
    const [orgRows, subCount, userRows] = await Promise.all([
      prisma
        .$queryRaw<{ industry: string | null }[]>(Prisma.sql`SELECT "industry" FROM "Organization" WHERE "id" = ${orgId} LIMIT 1`)
        .catch(() => [] as { industry: string | null }[]),
      prisma.mrrSnapshot.count({ where: { orgId } }).catch(() => 0),
      prisma
        .$queryRaw<{ accountType: string | null }[]>(Prisma.sql`SELECT "accountType" FROM "User" WHERE "id" = ${user.id} LIMIT 1`)
        .catch(() => [] as { accountType: string | null }[]),
    ])
    const suggestion = inferIndustry(ledger, subCount > 0)
    const industry = (orgRows[0]?.industry as Industry | null) ?? null
    const accountType = (userRows[0]?.accountType as 'owner' | 'advisor' | null) ?? null

    const payload = {
      hasData: ledger.length > 0 || cashBalance != null,
      sources,
      ledgerSources: [...(await ledgerSources(orgId))],
      incomeStatement: is,
      cashFlow: cf,
      cash: { balance: cashBalance },
      runwayMonths: runway,
      marketing,
      industry,
      // Only suggest when the evidence is reasonably strong; else the UI asks.
      industrySuggestion: !industry && suggestion.confidence >= 0.4 ? suggestion.industry : null,
      accountType,
      generatedAt: new Date().toISOString(),
    }

    await cache.set(key, payload, cache.TTL.MEDIUM)
    return Response.json(payload)
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ hasData: false, error: 'metrics_failed' }, { status: 200 })
  }
}
