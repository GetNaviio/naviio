import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode } from '@/lib/integrations/adp'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'ADP',
    errorSlug: 'adp',
    successSlug: 'adp',
    label: 'ADP',
    exchange: async ({ code }) => exchangeCode(code),
  })
}
