/**
 * Meta (Facebook/Instagram) Ads — OAuth + daily insights sync.
 *
 * Powers ad-spend validation: daily spend/KPIs land in AdInsight, and the
 * matcher (src/lib/ads/match.ts) reconciles them against FACEBK bank charges.
 *
 * Requires env: META_ADS_APP_ID, META_ADS_APP_SECRET
 * (+ optional META_ADS_REDIRECT_URI). Scope ads_read needs Meta app review —
 * until credentials exist the connect button reports "Not configured", same
 * as Gusto/ADP.
 */
import { prisma } from '@/lib/prisma'
import { getTokenForUser } from './refreshToken'

const V = process.env.META_GRAPH_VERSION ?? 'v19.0'
const GRAPH = `https://graph.facebook.com/${V}`

const redirectUri = () =>
  process.env.META_ADS_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/meta-ads/callback`

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_ADS_APP_ID ?? '',
    redirect_uri: redirectUri(),
    state,
    // ads_read alone covers /act_N/insights; read_insights is a Page-analytics
    // permission and is rejected as an invalid scope for Marketing API apps.
    scope: 'ads_read',
    response_type: 'code',
  })
  return `https://www.facebook.com/${V}/dialog/oauth?${params}`
}

export function isConfigured(): boolean {
  return !!(process.env.META_ADS_APP_ID && process.env.META_ADS_APP_SECRET)
}

/** Code → short-lived token → long-lived (~60d) token. */
export async function exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number | null }> {
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: process.env.META_ADS_APP_ID ?? '',
      client_secret: process.env.META_ADS_APP_SECRET ?? '',
      redirect_uri: redirectUri(),
      code,
    })}`,
  )
  if (!shortRes.ok) throw new Error(`Meta token exchange failed: ${shortRes.status}`)
  const short = await shortRes.json()

  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_ADS_APP_ID ?? '',
      client_secret: process.env.META_ADS_APP_SECRET ?? '',
      fb_exchange_token: short.access_token,
    })}`,
  )
  if (!longRes.ok) return { accessToken: short.access_token, expiresIn: short.expires_in ?? null }
  const long = await longRes.json()
  return { accessToken: long.access_token, expiresIn: long.expires_in ?? null }
}

// Conversions: prefer purchases, fall back to leads — the actions an SMB
// actually counts as "what the money bought".
function pickConversions(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions?.length) return 0
  const prefer = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'lead', 'onsite_conversion.lead_grouped']
  for (const type of prefer) {
    const hit = actions.find((a) => a.action_type === type)
    if (hit) return Number(hit.value) || 0
  }
  return 0
}

function pickConversionValue(values: { action_type: string; value: string }[] | undefined): number | null {
  if (!values?.length) return null
  const hit = values.find((a) => a.action_type.includes('purchase'))
  return hit ? Number(hit.value) || null : null
}

interface MetaInsightRow {
  date_start: string
  spend: string
  impressions: string
  clicks: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
}

async function graphGet<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = `${GRAPH}/${path}?${new URLSearchParams({ ...params, access_token: token })}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Meta API ${path} failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/** Sync daily insights for every ad account the token can read. */
export async function syncMetaAds(orgId: string): Promise<{ accounts: number; days: number }> {
  const token = await getTokenForUser(orgId, 'META_ADS')
  if (!token) throw new Error('Meta Ads not connected')

  const integration = await prisma.integration.findFirst({
    where: { orgId, provider: 'META_ADS' },
    select: { id: true, lastSyncedAt: true },
  })

  // First sync: 13 months back (covers YoY ad analysis). Routine: 40 days
  // (re-reads attribution restatements; upserts make it idempotent).
  const sinceDate = integration?.lastSyncedAt
    ? new Date(Date.now() - 40 * 86400_000)
    : new Date(Date.now() - 395 * 86400_000)
  const since = sinceDate.toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)

  const accounts = await graphGet<{ data: { id: string; account_id: string; name: string }[] }>(
    'me/adaccounts', token, { fields: 'account_id,name', limit: '50' },
  )

  let days = 0
  for (const acct of accounts.data ?? []) {
    let after: string | undefined
    do {
      const page = await graphGet<{ data: MetaInsightRow[]; paging?: { cursors?: { after?: string }; next?: string } }>(
        `act_${acct.account_id}/insights`, token, {
          time_increment: '1',
          time_range: JSON.stringify({ since, until }),
          fields: 'spend,impressions,clicks,actions,action_values',
          limit: '100',
          ...(after ? { after } : {}),
        },
      )
      for (const r of page.data ?? []) {
        await prisma.adInsight.upsert({
          where: { orgId_provider_accountId_date: { orgId, provider: 'META_ADS', accountId: acct.account_id, date: r.date_start } },
          create: {
            orgId, provider: 'META_ADS', accountId: acct.account_id, accountName: acct.name, date: r.date_start,
            spend: Number(r.spend) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            conversions: pickConversions(r.actions),
            conversionValue: pickConversionValue(r.action_values),
          },
          update: {
            accountName: acct.name,
            spend: Number(r.spend) || 0,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            conversions: pickConversions(r.actions),
            conversionValue: pickConversionValue(r.action_values),
          },
        })
        days++
      }
      after = page.paging?.next ? page.paging?.cursors?.after : undefined
    } while (after)
  }

  if (integration) {
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), status: 'CONNECTED' } })
  }
  return { accounts: accounts.data?.length ?? 0, days }
}
