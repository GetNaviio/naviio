import {
  buildDiscoverableAuthenticationOptions,
  signChallenge,
  challengeCookie,
  LOGIN_COOKIE,
} from '@/lib/webauthn'
import { rateLimit } from '@/lib/rate-limit'

// Passwordless passkey sign-in, step 1. No email — the discoverable credential
// the user picks tells us who they are at verify time.
export async function POST(request: Request) {
  // Public, unauthenticated endpoint — same brute-force budget as login.
  const limited = await rateLimit(request, 'login')
  if (limited) return limited

  try {
    const options = await buildDiscoverableAuthenticationOptions()
    return new Response(JSON.stringify(options), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': challengeCookie(LOGIN_COOKIE, signChallenge(options.challenge, 'auth')),
      },
    })
  } catch (err) {
    console.error('passkey login options error:', err)
    return Response.json({ error: 'Failed to start passkey sign-in' }, { status: 500 })
  }
}
