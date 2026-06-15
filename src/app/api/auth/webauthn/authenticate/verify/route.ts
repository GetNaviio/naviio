import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  verifyPreAuthToken,
  PREAUTH_COOKIE_NAME,
  signToken,
  makeSessionCookieHeader,
  clearPreAuthCookieHeader,
} from '@/lib/auth'
import {
  checkAuthentication,
  readChallenge,
  clearChallengeCookie,
  parseTransports,
  AUTH_COOKIE,
} from '@/lib/webauthn'

// Step 2 of passkey login. Verifies the assertion against the user's stored
// credential, then mints the full session — the passkey is the second factor.
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(PREAUTH_COOKIE_NAME)?.value
    const pending = token ? verifyPreAuthToken(token) : null
    if (!pending) return Response.json({ error: 'Session expired — sign in again.' }, { status: 401 })

    const challenge = readChallenge(cookieStore.get(AUTH_COOKIE)?.value, 'auth')
    if (!challenge) return Response.json({ error: 'Passkey session expired' }, { status: 400 })

    const body = await request.json()
    const cred = await prisma.credential.findFirst({
      where: { id: body.id, userId: pending.userId },
    })
    if (!cred) return Response.json({ error: 'Unknown passkey' }, { status: 400 })

    const verification = await checkAuthentication({
      response: body,
      expectedChallenge: challenge,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(cred.publicKey),
        counter: cred.counter,
        transports: parseTransports(cred.transports),
      },
    })
    if (!verification.verified) {
      return Response.json({ error: 'Passkey verification failed' }, { status: 422 })
    }

    await prisma.credential.update({
      where: { id: cred.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    })

    const session = signToken({ userId: pending.userId, email: pending.email })
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(session))
    headers.append('Set-Cookie', clearPreAuthCookieHeader())
    headers.append('Set-Cookie', clearChallengeCookie(AUTH_COOKIE))
    headers.set('Content-Type', 'application/json')
    return new Response(JSON.stringify({ verified: true }), { status: 200, headers })
  } catch (err) {
    console.error('webauthn authenticate verify error:', err)
    return Response.json({ error: 'Failed to verify passkey' }, { status: 500 })
  }
}
