import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  checkRegistration,
  readRegContext,
  clearChallengeCookie,
  REG_COOKIE,
} from '@/lib/webauthn'

// Step 2 of passkey registration. Verifies the authenticator's response against
// the stashed challenge and persists the new credential. Registering a passkey
// satisfies the account's 2FA requirement (see userHasSecondFactor).
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()

    const cookieStore = await cookies()
    const ctx = readRegContext(cookieStore.get(REG_COOKIE)?.value)
    if (!ctx) return Response.json({ error: 'Registration session expired' }, { status: 400 })

    const verification = await checkRegistration({ response: body, expectedChallenge: ctx.challenge })
    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: 'Passkey verification failed' }, { status: 400 })
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await prisma.credential.create({
      data: {
        id: credential.id,
        userId: user.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports?.join(',') ?? null,
        webauthnUserID: ctx.waUserID,
        name: typeof body?.label === 'string' && body.label ? body.label.slice(0, 60) : 'Passkey',
      },
    })

    return new Response(JSON.stringify({ verified: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearChallengeCookie(REG_COOKIE) },
    })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('webauthn register verify error:', err)
    return Response.json({ error: 'Failed to register passkey' }, { status: 500 })
  }
}
