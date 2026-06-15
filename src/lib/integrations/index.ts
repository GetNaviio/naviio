import { prisma } from '@/lib/prisma'
import { fetchPlaidData } from './plaid'
import { fetchQuickBooksData, syncQuickBooksTransactions } from './quickbooks'
import { fetchXeroData, syncXeroTransactions } from './xero'
import { fetchStripeData, captureMrrSnapshot } from './stripe'
import { fetchGHLData } from './ghl'
import { fetchGustoData } from './gusto'
import { fetchADPData } from './adp'
import { fetchShopifyData } from './shopify'
import { summarizeAccounting, type AccountingSummary } from './accounting-map'

export interface NormalizedFinancials {
  revenue: {
    mrr: number | null
    arr: number | null
    grossRevenue30d: number | null
    netRevenue30d: number | null
    shopifyRevenue: number | null
    pipelineValue: number | null
  }
  expenses: {
    payrollCost: number | null
    headcount: number | null
  }
  cash: {
    bankBalance: number | null
    accounts: unknown[] | null
  }
  customers: {
    total: number | null
    openDeals: number | null
    churnedThisMonth: number | null
  }
  accounting: AccountingSummary | null
  sources: {
    plaid: boolean
    quickbooks: boolean
    xero: boolean
    stripe: boolean
    ghl: boolean
    gusto: boolean
    adp: boolean
    shopify: boolean
  }
  raw: Record<string, unknown>
  syncedAt: string
}

/**
 * Fetch and aggregate live data from all connected integrations for a user.
 * Uses Promise.allSettled so a single failing integration never blocks the rest.
 */
export async function fetchAllData(orgId: string): Promise<NormalizedFinancials> {
  // Discover which integrations are active
  const active = await prisma.integration.findMany({
    where: { orgId, status: 'CONNECTED' },
    select: { provider: true },
  })
  const connected = new Set(active.map((i: { provider: string }) => i.provider))

  // Populate the ledger from accounting transactions ONLY when they're the
  // fallback (no Plaid/Stripe), so the same bank activity is never double-counted.
  // Best-effort — never blocks the aggregate.
  if (!connected.has('PLAID') && !connected.has('STRIPE')) {
    await Promise.allSettled([
      connected.has('QUICKBOOKS') ? syncQuickBooksTransactions(orgId) : Promise.resolve(0),
      connected.has('XERO') ? syncXeroTransactions(orgId) : Promise.resolve(0),
    ])
  }

  // Capture this month's MRR snapshot so NRR / waterfall / cohorts build over
  // time (idempotent upsert — best-effort, never blocks the aggregate).
  if (connected.has('STRIPE')) {
    await captureMrrSnapshot(orgId).catch(() => {})
  }

  // Kick off all fetches in parallel
  const [plaid, qbo, xero, stripe, ghl, gusto, adp, shopify] = await Promise.allSettled([
    connected.has('PLAID')       ? fetchPlaidData(orgId)       : Promise.resolve(null),
    connected.has('QUICKBOOKS')  ? fetchQuickBooksData(orgId)  : Promise.resolve(null),
    connected.has('XERO')        ? fetchXeroData(orgId)        : Promise.resolve(null),
    connected.has('STRIPE')      ? fetchStripeData(orgId)      : Promise.resolve(null),
    connected.has('GOHIGHLEVEL')         ? fetchGHLData(orgId)         : Promise.resolve(null),
    connected.has('GUSTO')       ? fetchGustoData(orgId)       : Promise.resolve(null),
    connected.has('ADP')         ? fetchADPData(orgId)         : Promise.resolve(null),
    connected.has('SHOPIFY')     ? fetchShopifyData(orgId)     : Promise.resolve(null),
  ])

  const v = <T>(r: PromiseSettledResult<T | null>) =>
    r.status === 'fulfilled' ? r.value : null

  const plaidData   = v(plaid)
  const qboData     = v(qbo)   as { profitAndLoss?: unknown; invoices?: unknown } | null
  const xeroData    = v(xero)  as { profitAndLoss?: unknown; invoices?: unknown } | null
  const stripeData  = v(stripe)
  const ghlData     = v(ghl)
  const gustoData   = v(gusto)
  const adpData     = v(adp)
  const shopifyData = v(shopify)

  // Update lastSyncAt for all active integrations
  await prisma.integration.updateMany({
    where: { orgId, status: 'CONNECTED' },
    data: { lastSyncedAt: new Date() },
  })

  return {
    revenue: {
      mrr:             stripeData?.mrr?.mrr ?? null,
      arr:             stripeData?.mrr?.arr ?? null,
      grossRevenue30d: stripeData?.revenue?.grossRevenue ?? shopifyData?.revenue?.grossRevenue ?? null,
      netRevenue30d:   stripeData?.revenue?.netRevenue   ?? shopifyData?.revenue?.netRevenue   ?? null,
      shopifyRevenue:  shopifyData?.revenue?.grossRevenue ?? null,
      pipelineValue:   ghlData?.pipelineValue ?? null,
    },
    expenses: {
      payrollCost: gustoData?.latestPayrollCost ?? null,
      headcount:   gustoData?.headcount ?? adpData?.headcount ?? null,
    },
    cash: {
      bankBalance: plaidData?.cashBalance ?? null,
      accounts:    plaidData?.accounts    ?? null,
    },
    customers: {
      total:            stripeData?.mrr?.activeSubscriptions ?? null,
      openDeals:        ghlData?.openDeals ?? null,
      churnedThisMonth: stripeData?.churn?.canceledCount ?? null,
    },
    accounting: summarizeAccounting(qboData, xeroData),
    sources: {
      plaid:       connected.has('PLAID'),
      quickbooks:  connected.has('QUICKBOOKS'),
      xero:        connected.has('XERO'),
      stripe:      connected.has('STRIPE'),
      ghl:         connected.has('GOHIGHLEVEL'),
      gusto:       connected.has('GUSTO'),
      adp:         connected.has('ADP'),
      shopify:     connected.has('SHOPIFY'),
    },
    raw: {
      plaid:      plaidData,
      quickbooks: qboData,
      xero:       xeroData,
      stripe:     stripeData,
      ghl:        ghlData,
      gusto:      gustoData,
      adp:        adpData,
      shopify:    shopifyData,
    },
    syncedAt: new Date().toISOString(),
  }
}
