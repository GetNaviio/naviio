import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signToken, makeSessionCookieHeader } from '@/lib/auth'
import {
  checkRegistration,
  readSignupContext,
  clearChallengeCookie,
  SIGNUP_COOKIE,
} from '@/lib/webauthn'

// Create-account-with-passkey, step 2. Verify the new credential against the
// stashed challenge, create the user (no password) + credential atomically, and
// mint the session.
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const ctx = readSignupContext(cookieStore.get(SIGNUP_COOKIE)?.value)
    if (!ctx) return Response.json({ error: 'Sign-up session expired' }, { status: 400 })

    const body = await request.json()
    const verification = await checkRegistration({ response: body, expectedChallenge: ctx.challenge })
    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: 'Passkey verification failed' }, { status: 400 })
    }

    // Re-check the email is still free (guards a race between options and verify).
    const existing = await prisma.user.findUnique({ where: { email: ctx.email }, select: { id: true } })
    if (existing) return Response.json({ error: 'An account with this email already exists' }, { status: 409 })

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    const user = await prisma.user.create({ data: { email: ctx.email } })
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
        name: 'Passkey',
      },
    })

    const token = signToken({ userId: user.id, email: user.email })
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(token))
    headers.append('Set-Cookie', clearChallengeCookie(SIGNUP_COOKIE))
    headers.set('Content-Type', 'application/json')
    return new Response(JSON.stringify({ verified: true }), { status: 200, headers })
  } catch (err) {
    console.error('passkey signup verify error:', err)
    return Response.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
