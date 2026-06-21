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
    const existing = await prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: 'PLAID' } },
      select: { accessToken: true, status: true },
    })
    const needsUpdate = accountSelection || existing?.status === 'ERROR'
    const updateToken = needsUpdate && existing?.accessToken ? existing.accessToken : undefined

    const linkToken = await createLinkToken(orgId, updateToken, accountSelection)
    return Response.json({ link_token: linkToken })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // errMsg pulls Plaid's error_type/error_code/error_message out of the
    // axios response so the real cause shows up in the server log.
    const detail = errMsg(err)
    console.error('Plaid create-link-token error:', detail)
    // TEMP DEBUG: surface the detail in all environments so the cause is visible
    // in the browser. Revert to production-gating once the local issue is fixed.
    return Response.json({ error: 'Failed to create link token', detail }, { status: 500 })
  }
}
