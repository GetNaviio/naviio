import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  signToken,
  makeSessionCookieHeader,
  signPreAuthToken,
  makePreAuthCookieHeader,
} from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Built-in demo account. A hardcoded shared credential with no second factor is
// incompatible with the Plaid MFA attestation (SEC-ATT-001 / ATT-1) and bank
// terms, so it is accepted ONLY outside production. In production this branch is
// dead and the demo email/password fall through to normal (failing) auth.
const DEMO_LOGIN_ALLOWED = process.env.NODE_ENV !== 'production'
const DEMO_USER = {
  id: 'demo_user',
  email: 'demo@markupai.com',
  password: 'password123',
  name: 'Eric Franco',
  company: 'Naviio',
}

function cookieRedirect(token: string, destination: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Set-Cookie': makeSessionCookieHeader(token),
    },
  })
}

/** Form POST — browser handles cookie + redirect natively (used by login page) */
export async function POST(request: Request) {
  try {
    // Brute-force guard: 10 attempts/min per IP before any credential work.
    const limited = await rateLimit(request, 'login')
    if (limited) return limited

    const contentType = request.headers.get('content-type') ?? ''
    let email: string, password: string, next = ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      email = body.email
      password = body.password
    } else {
      const form = await request.formData()
      email = (form.get('email') as string) ?? ''
      password = (form.get('password') as string) ?? ''
      next = (form.get('next') as string) ?? ''
    }

    // Post-login destination (used by invite links). Same-origin paths ONLY —
    // a leading single slash; '//host' and absolute URLs are open redirects.
    const destination = /^\/(?!\/)/.test(next) ? next : '/dashboard'

    if (!email || !password) {
      return Response.redirect(new URL('/login?error=missing', request.url), 302)
    }

    // Demo mode — non-production only. The demo user has no MFA, so it must never
    // be reachable in production where the attestation applies.
    if (
      DEMO_LOGIN_ALLOWED &&
      email.toLowerCase() === DEMO_USER.email &&
      password === DEMO_USER.password
    ) {
      const token = signToken({ userId: DEMO_USER.id, email: DEMO_USER.email })

      // JSON client gets JSON back; form submissions get a redirect
      if (contentType.includes('application/json')) {
        return new Response(
          JSON.stringify({ user: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, company: DEMO_USER.company } }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': makeSessionCookieHeader(token) } }
        )
      }
      return cookieRedirect(token, destination)
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user) return Response.redirect(new URL('/login?error=invalid', request.url), 302)

    // Account flagged for deletion → no login (access disabled per SEC-POL-003).
    if (user.deletedAt) return Response.redirect(new URL('/login?error=invalid', request.url), 302)

    if (!user.passwordHash) return Response.redirect(new URL("/login?error=invalid", request.url), 302)
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) return Response.redirect(new URL('/login?error=invalid', request.url), 302)

    // ATT-1 (SEC-ATT-001): when a second factor is configured (TOTP OR a passkey),
    // the password is only the FIRST factor. Do NOT issue a session yet — issue a
    // short-lived pre-auth token and send the user to the challenge. The session
    // is only minted after /api/auth/mfa/verify or the passkey flow succeeds.
    const hasSecondFactor = user.mfaEnabled || (await prisma.credential.count({ where: { userId: user.id } })) > 0
    if (hasSecondFactor) {
      const preAuth = signPreAuthToken({ userId: user.id, email: user.email })
      const headers = { 'Set-Cookie': makePreAuthCookieHeader(preAuth) }

      if (contentType.includes('application/json')) {
        return new Response(JSON.stringify({ mfaRequired: true }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, {
        status: 302,
        headers: { ...headers, Location: '/login/mfa' },
      })
    }

    const token = signToken({ userId: user.id, email: user.email })
    return cookieRedirect(token, destination)
  } catch {
    return Response.redirect(new URL('/login?error=server', request.url), 302)
  }
}
