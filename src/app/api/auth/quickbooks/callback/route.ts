import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode, syncQuickBooksTransactions } from '@/lib/integrations/quickbooks'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'QUICKBOOKS',
    errorSlug: 'qbo',
    successSlug: 'quickbooks',
    label: 'QuickBooks',
    // QB's SDK parses the code (and realmId) from the full callback URL itself.
    exchange: async ({ request }) => {
      const { accessToken, refreshToken, realmId, expiresIn } = await exchangeCode(request.url)
      return { accessToken, refreshToken, realmId, expiresIn }
    },
    // Pull transactions into the ledger now (best-effort).
    postConnect: syncQuickBooksTransactions,
  })
}
