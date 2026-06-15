import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, syncMetaAds } from '@/lib/integrations/meta-ads'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'META_ADS',
    errorSlug: 'meta_ads',
    successSlug: 'meta_ads',
    label: 'Meta Ads',
    exchange: async ({ code }) => exchangeCode(code),
    // Pull insights immediately so the first FACEBK hover already has data.
    postConnect: (orgId) => syncMetaAds(orgId),
  })
}
