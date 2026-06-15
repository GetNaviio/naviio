import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth'

// POST { password, code } — disables MFA after re-confirming password + current TOTP code.
export async function POST(request: Request) {
  try {
    const user               = await requireAuth()
    const { password, code } = await request.json()
    if (!password || !code) {
      return Response.json({ error: 'password and code are required' }, { status: 400 })
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
      return Response.json({ error: 'MFA is not enabled' }, { status: 400 })
    }

    if (dbUser.passwordHash && !(await verifyPassword(password, dbUser.passwordHash))) {
      return Response.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const { verifyToken } = await import('@/lib/mfa')
    if (!verifyToken(code, dbUser.mfaSecret)) {
      return Response.json({ error: 'Invalid authenticator code' }, { status: 422 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data:  { mfaEnabled: false, mfaSecret: null },
    })

    return Response.json({ success: true })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
