import { prisma } from '@/lib/prisma'
import { getTokenForUser } from './refreshToken'
import { mapXeroBankTransaction } from './accounting-txn-map'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_REVOKE_URL = 'https://identity.xero.com/connect/revocation'
const XERO_API = 'https://api.xero.com/api.xro/2.0'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'

export function getAuthUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID ?? '',
    redirect_uri: process.env.XERO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/xero/callback`,
    // Granular scopes (apps created on/after 2 Mar 2026 only get these). We read
    // the P&L + Balance Sheet reports and outstanding invoices, nothing else.
    scope: [
      'openid',
      'profile',
      'email',
      'accounting.reports.profitandloss.read',
      'accounting.reports.balancesheet.read',
      'accounting.invoices.read',
      'offline_access',
    ].join(' '),
    state,
  })
  return `${XERO_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/xero/callback`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Xero token exchange failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
    idToken: data.id_token as string,
  }
}

export async function getActiveTenantId(accessToken: string): Promise<string | null> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) return null
  const connections = await res.json()
  return connections[0]?.tenantId ?? null
}

/**
 * Best-effort revoke of the Xero refresh token (kills every connection for this
 * grant). Never throws — local disconnect must still succeed.
 */
export async function revokeXero(orgId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'XERO' } },
    select: { refreshToken: true },
  })
  if (!integration?.refreshToken) return
  try {
    await fetch(XERO_REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ token: integration.refreshToken }),
    })
  } catch (err) {
    console.error('[xero] revoke failed (token cleared locally anyway):', err instanceof Error ? err.message : err)
  }
}

async function xeroGet(accessToken: string, tenantId: string, path: string) {
  const res = await fetch(`${XERO_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Xero API ${res.status} ${path}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function fetchProfitAndLoss(userId: string) {
  const token = await getTokenForUser(userId, 'xero')
  if (!token) return null
  const tenantId = await getActiveTenantId(token)
  if (!tenantId) return null
  const fromDate = `${new Date().getFullYear()}-01-01`
  const toDate = new Date().toISOString().slice(0, 10)
  return xeroGet(token, tenantId, `/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`)
}

export async function fetchBalanceSheet(userId: string) {
  const token = await getTokenForUser(userId, 'xero')
  if (!token) return null
  const tenantId = await getActiveTenantId(token)
  if (!tenantId) return null
  const date = new Date().toISOString().slice(0, 10)
  return xeroGet(token, tenantId, `/Reports/BalanceSheet?date=${date}`)
}

export async function fetchInvoices(userId: string) {
  const token = await getTokenForUser(userId, 'xero')
  if (!token) return null
  const tenantId = await getActiveTenantId(token)
  if (!tenantId) return null
  return xeroGet(token, tenantId, `/Invoices?where=Status=="AUTHORISED"&order=DueDate ASC`)
}

/**
 * Sync Xero BankTransactions into our ledger (source='xero'). Used only as a
 * fallback when the org has no Plaid/Stripe. Returns the number of rows upserted.
 */
export async function syncXeroTransactions(orgId: string): Promise<number> {
  const token = await getTokenForUser(orgId, 'xero')
  if (!token) return 0
  const tenantId = await getActiveTenantId(token)
  if (!tenantId) return 0
  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'XERO' } },
    select: { id: true },
  })
  if (!integration) return 0

  // Xero pages BankTransactions at 100/page. Loop until a short page (bounded
  // at 10 pages = 1,000 txns per sync) — previously only page 1 was fetched,
  // silently dropping everything past the first 100 transactions.
  const XERO_PAGE_SIZE = 100
  const XERO_MAX_PAGES = 10
  const bankTxns: Parameters<typeof mapXeroBankTransaction>[2][] = []
  for (let page = 1; page <= XERO_MAX_PAGES; page++) {
    const data = await xeroGet(token, tenantId, `/BankTransactions?page=${page}`)
    const batch = (data.BankTransactions ?? []) as Parameters<typeof mapXeroBankTransaction>[2][]
    bankTxns.push(...batch)
    if (batch.length < XERO_PAGE_SIZE) break
  }
  const rows = bankTxns
    .map((bt) => mapXeroBankTransaction(orgId, integration.id, bt))
    .filter((r): r is NonNullable<typeof r> => r !== null)

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

export async function fetchXeroData(userId: string) {
  const [pl, invoices] = await Promise.allSettled([
    fetchProfitAndLoss(userId),
    fetchInvoices(userId),
  ])
  return {
    source: 'xero',
    profitAndLoss: pl.status === 'fulfilled' ? pl.value : null,
    invoices: invoices.status === 'fulfilled' ? invoices.value : null,
  }
}
