import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET — whether the authenticated user has TOTP two-factor enabled. Used by the
// Settings → Security banner so it reflects real state on load instead of
// defaulting to "not enabled".
export async function GET() {
  try {
    const user = await requireAuth()
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEnabled: true },
    })
    return Response.json({ mfaEnabled: !!dbUser?.mfaEnabled })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
