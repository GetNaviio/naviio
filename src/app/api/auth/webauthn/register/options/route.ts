import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildRegistrationOptions,
  signRegContext,
  challengeCookie,
  parseTransports,
  REG_COOKIE,
} from '@/lib/webauthn'

// Step 1 of passkey registration (user is logged in). Returns creation options
// for @simplewebauthn/browser startRegistration(), and stashes the challenge +
// WebAuthn user handle in a short-lived signed cookie.
export async function POST() {
  try {
    const user = await requireAuth()

    const existing = await prisma.credential.findMany({
      where: { userId: user.id },
      select: { id: true, transports: true },
    })

    const options = await buildRegistrationOptions({
      userName: user.email,
      excludeCredentials: existing.map((c: { id: string; transports: string | null }) => ({ id: c.id, transports: parseTransports(c.transports) })),
    })

    const ctx = signRegContext(options.challenge, options.user.id)
    return new Response(JSON.stringify(options), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': challengeCookie(REG_COOKIE, ctx) },
    })
  } catch (err) {
    if ((err as Error).message === 'UNAUTHORIZED') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const detail = err instanceof Error ? err.message : String(err)
    console.error('webauthn register options error:', detail)
    // Surface the real cause in non-production so passkey setup is debuggable.
    return Response.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to start registration' }
        : { error: `Failed to start registration: ${detail}` },
      { status: 500 },
    )
  }
}
