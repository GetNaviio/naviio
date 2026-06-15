import { prisma } from '@/lib/prisma'
import {
  buildRegistrationOptions,
  signSignupContext,
  challengeCookie,
  SIGNUP_COOKIE,
} from '@/lib/webauthn'

// Create-account-with-passkey, step 1. We need an email (passkeys don't carry
// one). Reject if it's already registered, then return creation options and stash
// the challenge + WebAuthn handle + email in a short-lived signed cookie.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
    if (!email || !email.includes('@')) return Response.json({ error: 'A valid email is required' }, { status: 400 })

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return Response.json({ error: 'An account with this email already exists' }, { status: 409 })

    const options = await buildRegistrationOptions({ userName: email, excludeCredentials: [] })

    return new Response(JSON.stringify(options), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': challengeCookie(SIGNUP_COOKIE, signSignupContext(options.challenge, options.user.id, email)),
      },
    })
  } catch (err) {
    console.error('passkey signup options error:', err)
    return Response.json({ error: 'Failed to start sign-up' }, { status: 500 })
  }
}
