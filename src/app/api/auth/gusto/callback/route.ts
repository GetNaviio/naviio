import { completeOAuthCallback } from '@/lib/integrations/oauth-callback'
import { exchangeCode } from '@/lib/integrations/gusto'

export async function GET(request: Request) {
  return completeOAuthCallback(request, {
    provider: 'GUSTO',
    errorSlug: 'gusto',
    successSlug: 'gusto',
    label: 'Gusto',
    exchange: async ({ code }) => exchangeCode(code),
  })
}
