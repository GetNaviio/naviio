import { cookies } from 'next/headers'
import { signToken, makeSessionCookieHeader, upsertFederatedUser } from '@/lib/auth'

// Google OAuth callback. Verify state (CSRF), exchange the code, read the verified
// profile, find-or-create the user, and mint the session.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = (await cookies()).get('g_oauth_state')?.value
  const fail = (e: string) => Response.redirect(new URL(`/login?error=${e}`, request.url), 302)

  if (!code || !state || !cookieState || state !== cookieState) return fail('invalid')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) return fail('google_unconfigured')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    if (!tokenRes.ok) return fail('google_failed')
    const tokens = await tokenRes.json()

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!infoRes.ok) return fail('google_failed')
    const info = await infoRes.json() as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }

    // Only trust a verified email for account linking/creation.
    if (!info.email || info.email_verified === false) return fail('google_unverified')

    const user = await upsertFederatedUser({
      email: info.email, name: info.name, image: info.picture, provider: 'google', providerAccountId: info.sub,
    })
    if (!user) return fail('invalid')

    const token = signToken({ userId: user.id, email: user.email })
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(token))
    headers.append('Set-Cookie', `g_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`)
    headers.set('Location', new URL('/dashboard', request.url).toString())
    return new Response(null, { status: 302, headers })
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return fail('google_failed')
  }
}
