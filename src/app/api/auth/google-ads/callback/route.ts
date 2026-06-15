import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, syncGoogleAds } from '@/lib/integrations/google-ads'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'GOOGLE_ADS',
    errorSlug: 'google_ads',
    successSlug: 'google_ads',
    label: 'Google Ads',
    exchange: async ({ code }) => exchangeCode(code),
    // Pull insights immediately so the first GOOGLE ADS hover already has data.
    postConnect: (orgId) => syncGoogleAds(orgId),
  })
}
