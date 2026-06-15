import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { fetchAllData } from '@/lib/integrations'

export async function POST() {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)
    const data = await fetchAllData(orgId)
    return Response.json(data)
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Integration sync error:', err)
    return Response.json({ error: 'Sync failed' }, { status: 500 })
  }
}

// GET version for quick polling / dashboard use
export async function GET() {
  return POST()
}
