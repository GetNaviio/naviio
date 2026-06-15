import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signToken, makeSessionCookieHeader } from '@/lib/auth'
import {
  checkAuthentication,
  readChallenge,
  clearChallengeCookie,
  parseTransports,
  LOGIN_COOKIE,
} from '@/lib/webauthn'

// Passwordless passkey sign-in, step 2. The user is identified by the credential
// returned (looked up by id), not by an email or pre-auth cookie. A passkey is a
// strong factor, so a successful assertion mints the session directly.
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const challenge = readChallenge(cookieStore.get(LOGIN_COOKIE)?.value, 'auth')
    if (!challenge) return Response.json({ error: 'Sign-in session expired' }, { status: 400 })

    const body = await request.json()
    const cred = await prisma.credential.findUnique({
      where: { id: body.id },
      select: { id: true, publicKey: true, counter: true, transports: true, user: { select: { id: true, email: true, deletedAt: true } } },
    })
    if (!cred || !cred.user || cred.user.deletedAt) return Response.json({ error: 'Unknown passkey' }, { status: 400 })

    const verification = await checkAuthentication({
      response: body,
      expectedChallenge: challenge,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(cred.publicKey),
        counter: cred.counter,
        transports: parseTransports(cred.transports),
      },
      // Passwordless = this assertion is BOTH factors. Reject UV=false
      // assertions: without this, a stolen security key with no PIN is a full
      // account takeover. Keys that can't UV fall back to password + TOTP.
      requireUserVerification: true,
    })
    if (!verification.verified) return Response.json({ error: 'Passkey verification failed' }, { status: 422 })

    await prisma.credential.update({
      where: { id: cred.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    })

    const token = signToken({ userId: cred.user.id, email: cred.user.email })
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(token))
    headers.append('Set-Cookie', clearChallengeCookie(LOGIN_COOKIE))
    headers.set('Content-Type', 'application/json')
    return new Response(JSON.stringify({ verified: true }), { status: 200, headers })
  } catch (err) {
    console.error('passkey login verify error:', err)
    return Response.json({ error: 'Failed to verify passkey' }, { status: 500 })
  }
}
