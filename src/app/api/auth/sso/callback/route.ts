import { cookies } from 'next/headers'
import { WorkOS } from '@workos-inc/node'
import { signToken, makeSessionCookieHeader, upsertFederatedUser } from '@/lib/auth'

// WorkOS SSO callback. Verify state, exchange the code for the SSO profile, then
// find-or-create the user and mint the session.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = (await cookies()).get('sso_state')?.value
  const fail = (e: string) => Response.redirect(new URL(`/login?error=${e}`, request.url), 302)

  if (!code || !state || !cookieState || state !== cookieState) return fail('invalid')

  const apiKey = process.env.WORKOS_API_KEY
  const clientId = process.env.WORKOS_CLIENT_ID
  if (!apiKey || !clientId) return fail('sso_unconfigured')

  try {
    const workos = new WorkOS(apiKey)
    const { profile } = await workos.sso.getProfileAndToken({ code, clientId })

    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null
    const user = await upsertFederatedUser({
      email: profile.email, name, provider: 'workos-sso', providerAccountId: profile.id,
    })
    if (!user) return fail('invalid')

    const token = signToken({ userId: user.id, email: user.email })
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    const headers = new Headers()
    headers.append('Set-Cookie', makeSessionCookieHeader(token))
    headers.append('Set-Cookie', `sso_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`)
    headers.set('Location', new URL('/dashboard', request.url).toString())
    return new Response(null, { status: 302, headers })
  } catch (err) {
    console.error('SSO callback error:', err)
    return fail('sso_failed')
  }
}
