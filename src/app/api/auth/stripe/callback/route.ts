import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, syncStripeData, captureMrrSnapshot } from '@/lib/integrations/stripe'

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
    // Sync immediately on connect so the dashboard is populated when the user
    // lands back — no empty-revenue gap until the next cron. Best-effort: the
    // callback wrapper logs errors here and never blocks the redirect.
    postConnect: async (orgId) => {
      await syncStripeData(orgId)        // persist charges → cash-basis P&L/Overview
      await captureMrrSnapshot(orgId)    // first MRR snapshot → movement starts accruing
    },
  })
}
