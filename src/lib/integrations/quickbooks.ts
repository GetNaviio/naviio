import OAuthClient from 'intuit-oauth'
import { prisma } from '@/lib/prisma'
import { getTokenForUser } from './refreshToken'
import { mapQBOPurchase, mapQBOSalesReceipt } from './accounting-txn-map'

export function createQBClient() {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID ?? '',
    clientSecret: process.env.QB_CLIENT_SECRET ?? '',
    environment: (process.env.QB_ENV as 'sandbox' | 'production') ?? 'sandbox',
    redirectUri: process.env.QB_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/quickbooks/callback`,
    logging: false,
  })
}

export function getAuthUrl(state: string) {
  return createQBClient().authorizeUri({ scope: [OAuthClient.scopes.Accounting], state })
}

export async function exchangeCode(url: string) {
  const auth = await createQBClient().createToken(url)
  const token = auth.getJson() as Record<string, unknown>
  return {
    accessToken: token.access_token as string,
    refreshToken: token.refresh_token as string,
    realmId: token.realmId as string,
    expiresIn: token.expires_in as number,
  }
}

/**
 * Best-effort revoke of the QuickBooks refresh token at Intuit. Never throws —
 * the local disconnect must still succeed if Intuit is unreachable.
 */
export async function revokeQuickBooks(orgId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } },
    select: { refreshToken: true },
  })
  if (!integration?.refreshToken) return
  try {
    await createQBClient().revoke({ refresh_token: integration.refreshToken })
  } catch (err) {
    console.error('[qbo] revoke failed (token cleared locally anyway):', err instanceof Error ? err.message : err)
  }
}

function qbBase() {
  return process.env.QB_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

async function qbGet(accessToken: string, realmId: string, path: string) {
  const res = await fetch(`${qbBase()}/v3/company/${realmId}${path}&minorversion=65`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`QuickBooks API ${res.status}: ${path}`)
  return res.json()
}

/**
 * QuickBooks YTD P&L. `method` selects the accounting basis: 'Accrual' for the
 * GAAP-basis report (revenue/expense when earned/incurred), 'Cash' for cash
 * basis. Omitted → the company's QuickBooks default.
 */
export async function fetchProfitAndLoss(orgId: string, method?: 'Accrual' | 'Cash') {
  const token = await getTokenForUser(orgId, 'quickbooks')
  if (!token) return null
  const int = await prisma.integration.findUnique({ where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } } })
  const realmId = int?.realmId
  if (!realmId) return null
  const today = new Date().toISOString().slice(0, 10)
  const start = `${new Date().getFullYear()}-01-01`
  const basis = method ? `&accounting_method=${method}` : ''
  return qbGet(token, realmId, `/reports/ProfitAndLoss?start_date=${start}&end_date=${today}${basis}`)
}

export async function fetchBalanceSheet(orgId: string) {
  const token = await getTokenForUser(orgId, 'quickbooks')
  if (!token) return null
  const int = await prisma.integration.findUnique({ where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } } })
  const realmId = int?.realmId
  if (!realmId) return null
  const today = new Date().toISOString().slice(0, 10)
  return qbGet(token, realmId, `/reports/BalanceSheet?end_date=${today}`)
}

export async function fetchExpenses(orgId: string) {
  const token = await getTokenForUser(orgId, 'quickbooks')
  if (!token) return null
  const int = await prisma.integration.findUnique({ where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } } })
  const realmId = int?.realmId
  if (!realmId) return null
  return qbGet(token, realmId, `/query?query=SELECT * FROM Purchase ORDER BY TxnDate DESC MAXRESULTS 100`)
}

export async function fetchInvoices(orgId: string) {
  const token = await getTokenForUser(orgId, 'quickbooks')
  if (!token) return null
  const int = await prisma.integration.findUnique({ where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } } })
  const realmId = int?.realmId
  if (!realmId) return null
  return qbGet(token, realmId, `/query?query=SELECT * FROM Invoice WHERE Balance > '0.00' ORDER BY DueDate ASC MAXRESULTS 100`)
}

/**
 * Sync QuickBooks Purchase (out) + Deposit/SalesReceipt (in) into our ledger
 * (source='quickbooks'). Fallback only — used when no Plaid/Stripe is connected.
 * Returns the number of rows upserted.
 */
export async function syncQuickBooksTransactions(orgId: string): Promise<number> {
  const token = await getTokenForUser(orgId, 'quickbooks')
  if (!token) return 0
  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'QUICKBOOKS' } },
    select: { id: true, realmId: true },
  })
  if (!integration?.realmId) return 0
  const { id: integrationId, realmId } = integration

  // Income from SalesReceipt only (cash sales). We deliberately do NOT pull
  // Deposit: a Deposit is the act of banking funds and frequently re-deposits a
  // SalesReceipt's payment (double-count) or records capital/transfers (not
  // income). Expenses from Purchase. Accrual entities (Invoice/Bill) are excluded
  // to keep this consistent with the cash-basis ledger.
  // QBO pages query results via STARTPOSITION/MAXRESULTS. Loop until a short
  // page (bounded at 10 pages = 1,000 rows per entity per sync) — previously a
  // single MAXRESULTS 100 call silently dropped older rows.
  const QB_PAGE_SIZE = 100
  const QB_MAX_PAGES = 10
  const qAll = async (entity: string): Promise<unknown[]> => {
    const out: unknown[] = []
    for (let page = 0; page < QB_MAX_PAGES; page++) {
      const start = page * QB_PAGE_SIZE + 1
      const data = await qbGet(
        token,
        realmId,
        `/query?query=SELECT * FROM ${entity} ORDER BY TxnDate DESC STARTPOSITION ${start} MAXRESULTS ${QB_PAGE_SIZE}`,
      )
      const batch = data?.QueryResponse?.[entity] ?? []
      out.push(...batch)
      if (batch.length < QB_PAGE_SIZE) break
    }
    return out
  }
  const [pur, sr] = await Promise.allSettled([qAll('Purchase'), qAll('SalesReceipt')])

  const rows = [
    ...(pur.status === 'fulfilled' ? pur.value.map((e: unknown) => mapQBOPurchase(orgId, integrationId, e as Parameters<typeof mapQBOPurchase>[2])) : []),
    ...(sr.status === 'fulfilled' ? sr.value.map((e: unknown) => mapQBOSalesReceipt(orgId, integrationId, e as Parameters<typeof mapQBOSalesReceipt>[2])) : []),
  ].filter((r): r is NonNullable<typeof r> => r !== null)

  // Batch all upserts in one transaction — one network round-trip set instead
  // of a sequential await per row (matches the Plaid/Stripe sync pattern).
  if (rows.length) {
    await prisma.$transaction(
      rows.map((t) =>
        prisma.transaction.upsert({
          where: { orgId_externalId: { orgId: t.orgId, externalId: t.externalId } },
          create: t,
          update: { amount: t.amount, type: t.type, category: t.category, description: t.description, date: t.date },
        }),
      ),
    )
  }
  return rows.length
}

export async function fetchQuickBooksData(orgId: string, method?: 'Accrual' | 'Cash') {
  const [pl, invoices] = await Promise.allSettled([
    fetchProfitAndLoss(orgId, method),
    fetchInvoices(orgId),
  ])
  return {
    source: 'quickbooks',
    profitAndLoss: pl.status === 'fulfilled' ? pl.value : null,
    invoices: invoices.status === 'fulfilled' ? invoices.value : null,
  }
}
