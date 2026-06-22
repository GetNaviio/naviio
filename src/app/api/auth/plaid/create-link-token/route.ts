import { requireAuth, getDefaultOrgId, userHasSecondFactor } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createLinkToken, errMsg } from '@/lib/integrations/plaid'

export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // Optional: { accountSelection: true } requests an update-mode token with
    // account selection enabled, so the user can add newly-available accounts.
    const body = await request.json().catch(() => ({}))
    const accountSelection = body?.accountSelection === true

    // ATT-1 (SEC-ATT-001): MFA must be ENFORCED — not merely available — on the
    // consumer-facing app where Plaid Link is deployed. Gate link-token issuance
    // on the account having two-factor authentication enabled. This is the
    // security boundary: the client cannot open Link without a token, so refusing
    // the token here blocks the connection regardless of client state.
    if (!(await userHasSecondFactor(user.id))) {
      return Response.json(
        {
          error: 'MFA_REQUIRED',
          message:
            'Enable two-factor authentication in Settings before connecting a bank account.',
        },
        { status: 403 },
      )
    }

    const orgId = await getDefaultOrgId(user.id)

    // Update mode reuses the existing item's access token instead of creating a
    // duplicate. Two triggers: (1) the item is in ERROR → re-authenticate;
    // (2) accountSelection requested → let the user add new accounts. Both need
    // the existing access token.
    //
    // Read `status` first (not encrypted). Only read the access token when we
    // actually need it, and tolerate a decryption failure — a token that can't
    // be decrypted (e.g. TOKEN_ENCRYPTION_KEY rotated) must NOT block creating a
    // brand-new link token. In that case we fall back to a fresh connection.
    const meta = await prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: 'PLAID' } },
      select: { status: true },
    })
    const needsUpdate = accountSelection || meta?.status === 'ERROR'

    let updateToken: string | undefined
    if (needsUpdate) {
      try {
        const tok = await prisma.integration.findUnique({
          where: { orgId_provider: { orgId, provider: 'PLAID' } },
          select: { accessToken: true },
        })
        updateToken = tok?.accessToken ?? undefined
      } catch (err) {
        console.error('Plaid: existing token unreadable — falling back to a fresh link token:', errMsg(err))
        updateToken = undefined
      }
    }

    const linkToken = await createLinkToken(orgId, updateToken, accountSelection)
    // Tell the client which mode we actually issued. When the prior token was
    // unreadable we fall back to a fresh ('create') token even if the client
    // asked for update mode — the client must then EXCHANGE (not refresh).
    return Response.json({ link_token: linkToken, mode: updateToken ? 'update' : 'create' })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // errMsg pulls Plaid's error_type/error_code/error_message out of the
    // axios response so the real cause shows up in the server log.
    const detail = errMsg(err)
    console.error('Plaid create-link-token error:', detail)
    // Surface the detail only outside production; in production the browser gets
    // a generic message while the real cause stays in the server logs.
    return Response.json(
      {
        error: 'Failed to create link token',
        ...(process.env.NODE_ENV !== 'production' ? { detail } : {}),
      },
      { status: 500 },
    )
  }
}
