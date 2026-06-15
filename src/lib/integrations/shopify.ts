import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'

const SHOPIFY_API_VERSION = '2024-01'

export function getAuthUrl(shop: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_CLIENT_ID ?? '',
    scope: 'read_orders,read_products,read_customers,read_analytics',
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/shopify/callback`,
    state,
    'grant_options[]': 'per-user',
  })
  return `https://${shop}/admin/oauth/authorize?${params}`
}

export async function exchangeCode(shop: string, code: string): Promise<{ accessToken: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })
  if (!res.ok) throw new Error(`Shopify token exchange failed: ${res.status}`)
  const data = await res.json()
  return { accessToken: data.access_token as string }
}

export function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac')
  params.delete('hmac')
  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const digest = createHmac('sha256', secret).update(message).digest('hex')
  return digest === hmac
}

async function shopifyGet(accessToken: string, shop: string, path: string) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path}.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${path}`)
  return res.json()
}

async function getShopIntegration(orgId: string) {
  const int = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'SHOPIFY' } },
  })
  if (!int?.accessToken || !int.realmId) return null
  return { token: int.accessToken, shop: int.realmId }
}

export async function fetchOrders(orgId: string) {
  const conn = await getShopIntegration(orgId)
  if (!conn) return null
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  return shopifyGet(conn.token, conn.shop, `/orders?status=any&created_at_min=${thirtyDaysAgo}&limit=250`)
}

export async function fetchRevenueSummary(orgId: string) {
  const conn = await getShopIntegration(orgId)
  if (!conn) return null
  const data = await shopifyGet(conn.token, conn.shop, `/orders?status=paid&limit=250&fields=total_price,refunds,created_at`)
  const orders: Array<{ total_price?: string; refunds?: Array<{ transactions?: Array<{ amount?: string }> }> }> = data.orders ?? []
  const grossRevenue = orders.reduce((sum: number, o) => sum + parseFloat(o.total_price ?? '0'), 0)
  const refunds = orders.reduce((sum: number, o) =>
    sum + (o.refunds ?? []).reduce((r: number, ref) =>
      r + (ref.transactions ?? []).reduce((t: number, tx) => t + parseFloat(tx.amount ?? '0'), 0), 0), 0)
  return { grossRevenue, refunds, netRevenue: grossRevenue - refunds, orderCount: orders.length }
}

export async function fetchProducts(orgId: string) {
  const conn = await getShopIntegration(orgId)
  if (!conn) return null
  return shopifyGet(conn.token, conn.shop, '/products?limit=50&fields=id,title,variants')
}

export async function fetchShopifyData(orgId: string) {
  const [revenue, orders] = await Promise.allSettled([
    fetchRevenueSummary(orgId),
    fetchOrders(orgId),
  ])
  return {
    source: 'shopify',
    revenue: revenue.status === 'fulfilled' ? revenue.value : null,
    orders: orders.status === 'fulfilled' ? orders.value : null,
  }
}
