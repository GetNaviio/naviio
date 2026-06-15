import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecret, generateOtpUri, generateQRCode } from '@/lib/mfa'

// POST — generates a new TOTP secret and QR code for the authenticated user.
// Does NOT enable MFA yet; the user must verify a code first via /api/auth/mfa/enable.
export async function POST() {
  try {
    const user = await requireAuth()

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return Response.json({ error: 'User not found' }, { status: 404 })
    if (dbUser.mfaEnabled) {
      return Response.json({ error: 'MFA is already enabled' }, { status: 400 })
    }

    const secret  = generateSecret()
    const otpUri  = generateOtpUri(user.email, secret)
    const qrCode  = await generateQRCode(otpUri)

    // Store the pending secret (not yet active — enabled only after verification)
    await prisma.user.update({
      where: { id: user.id },
      data:  { mfaSecret: secret },
    })

    return Response.json({ qrCode, secret, otpUri })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
