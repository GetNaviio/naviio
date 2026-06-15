import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken as verifyTotp } from '@/lib/mfa'
import {
  signToken,
  makeSessionCookieHeader,
  verifyPreAuthToken,
  clearPreAuthCookieHeader,
  PREAUTH_COOKIE_NAME,
} from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Second factor of login. The user identity is taken from the short-lived
// pre-auth cookie set by /api/auth/login after a valid password — NOT from the
// request body — so a caller cannot mint a session for an arbitrary userId.
export async function POST(request: Request) {
  try {
    // 6-digit TOTP is guessable at volume — hard-limit attempts per IP.
    const limited = await rateLimit(request, 'mfa')
    if (limited) return limited

    const contentType = request.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')

    // Pull the TOTP code from form or JSON.
    let code = ''
    if (isJson) {
      const body = await request.json().catch(() => ({}))
      code = (body.code ?? '').toString().trim()
    } else {
      const form = await request.formData()
      code = ((form.get('code') as string) ?? '').trim()
    }

    // Identity comes from the pre-auth cookie, not the client.
    const cookieStore = await cookies()
    const preAuth = cookieStore.get(PREAUTH_COOKIE_NAME)?.value
    const pending = preAuth ? verifyPreAuthToken(preAuth) : null
    if (!pending) {
      return isJson
        ? Response.json({ error: 'Session expired — sign in again.' }, { status: 401 })
        : Response.redirect(new URL('/login?error=invalid', request.url), 302)
    }

    if (!code) {
      return isJson
        ? Response.json({ error: 'A verification code is required.' }, { status: 400 })
        : Response.redirect(new URL('/login/mfa?error=missing', request.url), 302)
    }

    const user = await prisma.user.findUnique({ where: { id: pending.userId } })
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return isJson
        ? Response.json({ error: 'Invalid request' }, { status: 400 })
        : Response.redirect(new URL('/login?error=invalid', request.url), 302)
    }

    if (!verifyTotp(code, user.mfaSecret)) {
      return isJson
        ? Response.json({ error: 'Invalid or expired code' }, { status: 422 })
        : Response.redirect(new URL('/login/mfa?error=code', request.url), 302)
    }

    // Success: mint the real session and clear the pre-auth cookie.
    const token = signToken({ userId: user.id, email: user.email })
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(token))
    headers.append('Set-Cookie', clearPreAuthCookieHeader())

    if (isJson) {
      headers.set('Content-Type', 'application/json')
      return new Response(JSON.stringify({ success: true }), { status: 200, headers })
    }
    headers.set('Location', '/dashboard')
    return new Response(null, { status: 302, headers })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
