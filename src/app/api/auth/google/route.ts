import crypto from 'crypto'

// "Continue with Google" — start the OAuth flow. We set a random state cookie for
// CSRF protection and redirect to Google's consent screen. Works for both sign in
// and sign up (the callback finds-or-creates the user).
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return Response.redirect(new URL('/login?error=google_unconfigured', request.url), 302)
  }

  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'Set-Cookie': `g_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
    },
  })
}
