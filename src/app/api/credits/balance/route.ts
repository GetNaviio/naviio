import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { getBalance } from '@/lib/credits/account'

/** Current credit balance for the signed-in org. */
export async function GET() {
  let orgId: string
  try {
    const user = await requireAuth()
    orgId = await getDefaultOrgId(user.id)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json({ balance: await getBalance(orgId) })
}
