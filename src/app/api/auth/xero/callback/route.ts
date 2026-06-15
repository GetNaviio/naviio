import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, getActiveTenantId, syncXeroTransactions } from '@/lib/integrations/xero'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'XERO',
    errorSlug: 'xero',
    successSlug: 'xero',
    label: 'Xero',
    requireCode: true,
    exchange: async ({ code }) => {
      const { accessToken, refreshToken, expiresIn } = await exchangeCode(code)
      // Xero needs the tenant id for every API call — capture it now.
      const realmId = await getActiveTenantId(accessToken)
      return { accessToken, refreshToken, realmId, expiresIn }
    },
    // Pull bank transactions into the ledger now so the dashboard populates
    // immediately (best-effort — never block the connect redirect).
    postConnect: syncXeroTransactions,
  })
}
