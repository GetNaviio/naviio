import { getTokenForUser } from './refreshToken'

const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation'
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token'
const GHL_API = 'https://services.leadconnectorhq.com'

export function getAuthUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GHL_CLIENT_ID ?? '',
    redirect_uri: process.env.GHL_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/ghl/callback`,
    scope: 'contacts.readonly opportunities.readonly payments.readonly campaigns.readonly',
    state,
  })
  return `${GHL_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(GHL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID ?? '',
      client_secret: process.env.GHL_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.GHL_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/ghl/callback`,
    }),
  })
  if (!res.ok) throw new Error(`GHL token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
    locationId: data.locationId as string,
  }
}

async function ghlGet(accessToken: string, path: string, version = '2021-07-28') {
  const res = await fetch(`${GHL_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Version: version,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`GHL API ${res.status}: ${path}`)
  return res.json()
}

export async function fetchContacts(userId: string) {
  const token = await getTokenForUser(userId, 'ghl')
  if (!token) return null
  return ghlGet(token, '/contacts/?limit=100')
}

export async function fetchPipelines(userId: string) {
  const token = await getTokenForUser(userId, 'ghl')
  if (!token) return null
  return ghlGet(token, '/opportunities/pipelines')
}

export async function fetchOpportunities(userId: string) {
  const token = await getTokenForUser(userId, 'ghl')
  if (!token) return null
  // GHL pages search results at 100; follow meta.nextPageUrl (bounded at 10
  // pages) and merge — pipelineValue/openDeals are summed from this list, so
  // truncating at page 1 understated the pipeline. Response shape unchanged.
  const MAX_PAGES = 10
  const first = await ghlGet(token, '/opportunities/search?limit=100')
  const merged = [...(first?.opportunities ?? [])]
  let nextUrl: string | undefined = first?.meta?.nextPageUrl
  for (let page = 1; page < MAX_PAGES && nextUrl; page++) {
    let path: string
    try {
      const u = new URL(nextUrl)
      path = u.pathname + u.search
    } catch {
      break
    }
    const data = await ghlGet(token, path)
    merged.push(...(data?.opportunities ?? []))
    nextUrl = data?.meta?.nextPageUrl
  }
  return { ...first, opportunities: merged }
}

export async function fetchGHLData(userId: string) {
  const [contacts, opportunities, pipelines] = await Promise.allSettled([
    fetchContacts(userId),
    fetchOpportunities(userId),
    fetchPipelines(userId),
  ])

  const opps = opportunities.status === 'fulfilled' ? opportunities.value?.opportunities ?? [] : []
  const pipelineValue = opps.reduce((sum: number, o: { monetaryValue?: number }) => sum + (o.monetaryValue ?? 0), 0)

  return {
    source: 'ghl',
    contacts: contacts.status === 'fulfilled' ? contacts.value : null,
    opportunities: opportunities.status === 'fulfilled' ? opportunities.value : null,
    pipelines: pipelines.status === 'fulfilled' ? pipelines.value : null,
    pipelineValue,
    openDeals: opps.length,
  }
}
