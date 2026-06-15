import { redirect } from 'next/navigation'
import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, verifyHmac } from '@/lib/integrations/shopify'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Shopify-specific: verify the HMAC signature over the query string.
  if (!verifyHmac(new URLSearchParams(searchParams), process.env.SHOPIFY_CLIENT_SECRET ?? '')) {
    return Response.json({ error: 'Invalid HMAC signature' }, { status: 400 })
  }
  const shop = searchParams.get('shop') ?? ''
  if (!searchParams.get('code') || !shop) redirect('/integrations?error=shopify_missing_params')

  return completeOAuthCallback(request, {
    provider: 'SHOPIFY',
    errorSlug: 'shopify',
    successSlug: 'shopify',
    label: 'Shopify',
    exchange: async ({ code }) => {
      const { accessToken } = await exchangeCode(shop, code)
      return { accessToken, realmId: shop } // shop domain stored in realmId; token is permanent
    },
  })
}
