import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode } from '@/lib/integrations/ghl'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'GOHIGHLEVEL',
    errorSlug: 'ghl',
    successSlug: 'ghl',
    label: 'GHL',
    exchange: async ({ code }) => {
      const { accessToken, refreshToken, expiresIn, locationId } = await exchangeCode(code)
      return { accessToken, refreshToken, expiresIn, realmId: locationId }
    },
  })
}
