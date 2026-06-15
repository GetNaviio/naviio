import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// List the logged-in user's passkeys (for the Settings UI).
export async function GET() {
  try {
    const user = await requireAuth()
    const creds = await prisma.credential.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ credentials: creds })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to load passkeys' }, { status: 500 })
  }
}

// Remove a passkey (?id=...). Scoped to the owner.
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
    await prisma.credential.deleteMany({ where: { id, userId: user.id } })
    return Response.json({ success: true })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Failed to remove passkey' }, { status: 500 })
  }
}
