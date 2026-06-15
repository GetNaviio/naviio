/**
 * ADP Workforce Now integration.
 * ADP requires registered partner credentials and uses OAuth 2.0 with
 * client_credentials or authorization_code flow. Enterprise accounts may
 * also require mTLS certificate-based authentication.
 *
 * Sandbox: https://accounts.adp.com (requires ADP developer account)
 * Docs: https://developers.adp.com
 */

import { getTokenForUser } from './refreshToken'

const ADP_AUTH_URL = 'https://accounts.adp.com/auth/oauth/v2/authorize'
const ADP_TOKEN_URL = 'https://accounts.adp.com/auth/oauth/v2/token'
const ADP_API = 'https://api.adp.com'

export function getAuthUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ADP_CLIENT_ID ?? '',
    redirect_uri: process.env.ADP_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/adp/callback`,
    scope: 'openid profile workers payroll',
    state,
  })
  return `${ADP_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(ADP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.ADP_CLIENT_ID}:${process.env.ADP_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.ADP_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/adp/callback`,
    }),
  })
  if (!res.ok) throw new Error(`ADP token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
  }
}

async function adpGet(accessToken: string, path: string) {
  const res = await fetch(`${ADP_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`ADP API ${res.status}: ${path}`)
  return res.json()
}

export async function fetchWorkers(userId: string) {
  const token = await getTokenForUser(userId, 'adp')
  if (!token) return null
  // ADP pages via OData $top/$skip. Loop until a short page (bounded at 10
  // pages = 1,000 workers) — a single $top=100 call understated headcount for
  // larger companies. Response shape unchanged (workers array merged).
  const PAGE_SIZE = 100
  const MAX_PAGES = 10
  const filter = '$filter=workers/workerStatus/statusCode/codeValue eq "Active"'
  let first: { workers?: unknown[] } | null = null
  const merged: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await adpGet(token, `/hr/v2/workers?$top=${PAGE_SIZE}&$skip=${page * PAGE_SIZE}&${filter}`)
    if (!first) first = data
    const batch: unknown[] = data?.workers ?? []
    merged.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return { ...first, workers: merged }
}

export async function fetchPayStatements(userId: string) {
  const token = await getTokenForUser(userId, 'adp')
  if (!token) return null
  // payStatements requires associate OID; return summary data
  return adpGet(token, '/payroll/v1/pay-data-input')
}

export async function fetchADPData(userId: string) {
  const [workers] = await Promise.allSettled([fetchWorkers(userId)])
  const workerList: unknown[] = workers.status === 'fulfilled' ? workers.value?.workers ?? [] : []
  return {
    source: 'adp',
    headcount: workerList.length,
    workers: workers.status === 'fulfilled' ? workers.value : null,
  }
}
