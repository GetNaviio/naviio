import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyToken, generateBackupCodes } from '@/lib/mfa'

// POST { code } — verifies the TOTP code and activates MFA on the account.
export async function POST(request: Request) {
  try {
    const user   = await requireAuth()
    const { code } = await request.json()
    if (!code) return Response.json({ error: 'code is required' }, { status: 400 })

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser?.mfaSecret) {
      return Response.json({ error: 'MFA setup not initiated. Call /api/auth/mfa/setup first.' }, { status: 400 })
    }
    if (dbUser.mfaEnabled) {
      return Response.json({ error: 'MFA is already enabled' }, { status: 400 })
    }

    if (!verifyToken(code, dbUser.mfaSecret)) {
      return Response.json({ error: 'Invalid code. Please try again.' }, { status: 422 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data:  { mfaEnabled: true },
    })

    const backupCodes = generateBackupCodes(8)

    return Response.json({ success: true, backupCodes })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
