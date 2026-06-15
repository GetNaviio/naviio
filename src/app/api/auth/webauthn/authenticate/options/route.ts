import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyPreAuthToken, PREAUTH_COOKIE_NAME } from '@/lib/auth'
import {
  buildAuthenticationOptions,
  signChallenge,
  challengeCookie,
  parseTransports,
  AUTH_COOKIE,
} from '@/lib/webauthn'

// Step 1 of passkey login (second factor). Identity comes from the pre-auth
// cookie set after the password step — never from the client.
export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(PREAUTH_COOKIE_NAME)?.value
    const pending = token ? verifyPreAuthToken(token) : null
    if (!pending) return Response.json({ error: 'Session expired — sign in again.' }, { status: 401 })

    const creds = await prisma.credential.findMany({
      where: { userId: pending.userId },
      select: { id: true, transports: true },
    })
    if (creds.length === 0) return Response.json({ error: 'No passkeys registered' }, { status: 400 })

    const options = await buildAuthenticationOptions({
      allowCredentials: creds.map((c: { id: string; transports: string | null }) => ({ id: c.id, transports: parseTransports(c.transports) })),
    })

    return new Response(JSON.stringify(options), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': challengeCookie(AUTH_COOKIE, signChallenge(options.challenge, 'auth')),
      },
    })
  } catch (err) {
    console.error('webauthn authenticate options error:', err)
    return Response.json({ error: 'Failed to start passkey sign-in' }, { status: 500 })
  }
}
