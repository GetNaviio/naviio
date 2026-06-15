import { withOrg } from '@/lib/api/with-org'
import { setBalanceForDev } from '@/lib/credits/account'

// DEV-ONLY: zero out the signed-in org's credit balance (for testing the
// out-of-credits UI). Hard-disabled in production. Visit in the browser.
export const GET = withOrg(async (_request, { orgId }) => {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  const balance = await setBalanceForDev(orgId, 0)
  return Response.json({ balance })
})
