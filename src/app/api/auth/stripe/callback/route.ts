import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode } from '@/lib/integrations/stripe'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'STRIPE',
    errorSlug: 'stripe',
    successSlug: 'stripe',
    label: 'Stripe',
    requireCode: true,
    exchange: async ({ code }) => {
      const { accessToken, stripeUserId } = await exchangeCode(code)
      return { accessToken, realmId: stripeUserId } // no expiry — API keys are permanent
    },
  })
}
