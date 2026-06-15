import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { setBalanceForDev } from '@/lib/credits/account'

// DEV-ONLY: zero out the signed-in org's credit balance (for testing the
// out-of-credits UI). Hard-disabled in production. Visit in the browser.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  let orgId: string
  try {
    const user = await requireAuth()
    orgId = await getDefaultOrgId(user.id)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const balance = await setBalanceForDev(orgId, 0)
  return Response.json({ balance })
}
