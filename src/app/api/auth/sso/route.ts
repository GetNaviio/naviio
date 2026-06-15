import crypto from 'crypto'
import { WorkOS } from '@workos-inc/node'

// Start enterprise SSO. The user supplies their work email; we resolve their
// WorkOS organization by domain and redirect to that org's IdP. A state cookie
// guards against CSRF.
export async function GET(request: Request) {
  const apiKey = process.env.WORKOS_API_KEY
  const clientId = process.env.WORKOS_CLIENT_ID
  const redirectUri = process.env.WORKOS_REDIRECT_URI
  const fail = (e: string) => Response.redirect(new URL(`/login?error=${e}`, request.url), 302)
  if (!apiKey || !clientId || !redirectUri) return fail('sso_unconfigured')

  const email = (new URL(request.url).searchParams.get('email') ?? '').toLowerCase().trim()
  const domain = email.includes('@') ? email.split('@')[1] : ''
  if (!domain) return fail('sso_email')

  try {
    const workos = new WorkOS(apiKey)
    // Map the email domain → organization (configured in the WorkOS dashboard).
    const orgs = await workos.organizations.listOrganizations({ domains: [domain] })
    const org = orgs.data[0]
    if (!org) return fail('sso_no_connection')

    const state = crypto.randomBytes(16).toString('hex')
    const authorizationUrl = workos.sso.getAuthorizationUrl({
      clientId, redirectUri, state, organization: org.id, loginHint: email,
    })

    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizationUrl,
        'Set-Cookie': `sso_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
      },
    })
  } catch (err) {
    console.error('SSO start error:', err)
    return fail('sso_failed')
  }
}
