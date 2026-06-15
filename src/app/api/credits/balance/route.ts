import { withOrg } from '@/lib/api/with-org'
import { getBalance } from '@/lib/credits/account'

/** Current credit balance for the signed-in org. */
export const GET = withOrg(async (_request, { orgId }) => {
  return Response.json({ balance: await getBalance(orgId) })
})
