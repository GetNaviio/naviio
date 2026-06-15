/**
 * Google Ads — OAuth + daily insights sync (REST searchStream + GAQL).
 *
 * Requires env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 * GOOGLE_ADS_DEVELOPER_TOKEN (+ optional GOOGLE_ADS_REDIRECT_URI,
 * GOOGLE_ADS_API_VERSION, GOOGLE_ADS_LOGIN_CUSTOMER_ID for MCC setups).
 * The developer token needs Google approval — until then the connect button
 * reports "Not configured", same as Gusto/ADP.
 */
import { prisma } from '@/lib/prisma'
import { getTokenForUser } from './refreshToken'

const V = process.env.GOOGLE_ADS_API_VERSION ?? 'v18'
const API = `https://googleads.googleapis.com/${V}`

const redirectUri = () =>
  process.env.GOOGLE_ADS_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google-ads/callback`

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline', // refresh token — REFRESH_CONFIG rotates it
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN)
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`Google Ads token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? null,
    expiresIn: (data.expires_in as number) ?? null,
  }
}

function adsHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    'Content-Type': 'application/json',
  }
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) h['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  return h
}

interface GaqlRow {
  segments?: { date?: string }
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number; conversionsValue?: number }
  customer?: { descriptiveName?: string }
}

/** Sync daily account-level metrics for every accessible customer. */
export async function syncGoogleAds(orgId: string): Promise<{ accounts: number; days: number }> {
  const token = await getTokenForUser(orgId, 'GOOGLE_ADS')
  if (!token) throw new Error('Google Ads not connected')

  const integration = await prisma.integration.findFirst({
    where: { orgId, provider: 'GOOGLE_ADS' },
    select: { id: true, lastSyncedAt: true },
  })

  const sinceDate = integration?.lastSyncedAt
    ? new Date(Date.now() - 40 * 86400_000)
    : new Date(Date.now() - 395 * 86400_000)
  const since = sinceDate.toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)

  const listRes = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: adsHeaders(token) })
  if (!listRes.ok) throw new Error(`Google Ads listAccessibleCustomers failed: ${listRes.status}`)
  const { resourceNames = [] } = (await listRes.json()) as { resourceNames?: string[] }

  const query = `
    SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value, customer.descriptive_name
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'`

  let accounts = 0
  let days = 0
  for (const resource of resourceNames) {
    const customerId = resource.split('/')[1]
    if (!customerId) continue
    const res = await fetch(`${API}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: adsHeaders(token),
      body: JSON.stringify({ query }),
    })
    // Manager (MCC) accounts reject metric queries — skip them quietly.
    if (!res.ok) continue
    accounts++
    const chunks = (await res.json()) as { results?: GaqlRow[] }[]
    for (const chunk of Array.isArray(chunks) ? chunks : []) {
      for (const r of chunk.results ?? []) {
        const date = r.segments?.date
        if (!date) continue
        const data = {
          accountName: r.customer?.descriptiveName ?? null,
          spend: (Number(r.metrics?.costMicros) || 0) / 1_000_000,
          impressions: Number(r.metrics?.impressions) || 0,
          clicks: Number(r.metrics?.clicks) || 0,
          conversions: Number(r.metrics?.conversions) || 0,
          conversionValue: r.metrics?.conversionsValue != null ? Number(r.metrics.conversionsValue) : null,
        }
        await prisma.adInsight.upsert({
          where: { orgId_provider_accountId_date: { orgId, provider: 'GOOGLE_ADS', accountId: customerId, date } },
          create: { orgId, provider: 'GOOGLE_ADS', accountId: customerId, date, ...data },
          update: data,
        })
        days++
      }
    }
  }

  if (integration) {
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), status: 'CONNECTED' } })
  }
  return { accounts, days }
}
