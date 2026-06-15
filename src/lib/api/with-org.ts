/**
 * Route-handler wrappers: resolve the authenticated user (and default org)
 * once, with a single consistent 401 contract.
 *
 * Before: ~40 routes each open with one of two hand-rolled variants of
 *   try { user = await requireAuth(); orgId = await getDefaultOrgId(user.id) }
 *   catch { return 401 }
 * Wrapping kills that boilerplate and pins the 401 shape in one place.
 *
 * Semantics are intentionally narrow: ONLY the UNAUTHORIZED error is converted
 * to a 401 response. Anything else thrown by the handler propagates exactly as
 * before (each route keeps its own error strategy), so adopting the wrapper is
 * behavior-preserving for routes using the standard auth block.
 *
 * Usage:
 *   export const GET = withOrg(async (request, { user, orgId }) => { ... })
 *   export const POST = withAuth(async (request, { user }) => { ... })
 */
import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { getOrgRole } from '@/lib/org'

type AuthedUser = Awaited<ReturnType<typeof requireAuth>>

export type AuthContext = { user: AuthedUser }
export type OrgContext = { user: AuthedUser; orgId: string }
export type OwnerContext = { user: AuthedUser; orgId: string; role: 'OWNER' }

function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

function forbidden(): Response {
  return Response.json({ error: 'Only the organization owner can do this' }, { status: 403 })
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && err.message === 'UNAUTHORIZED'
}

/** Auth only — for routes that don't need the org (e.g. /api/auth/me). */
export function withAuth(
  handler: (request: Request, ctx: AuthContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let user: AuthedUser
    try {
      user = await requireAuth()
    } catch (err) {
      if (isUnauthorized(err)) return unauthorized()
      throw err
    }
    return handler(request, { user })
  }
}

/** Auth + default-org resolution — the common case for data routes. */
export function withOrg(
  handler: (request: Request, ctx: OrgContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let user: AuthedUser
    let orgId: string
    try {
      user = await requireAuth()
      orgId = await getDefaultOrgId(user.id)
    } catch (err) {
      if (isUnauthorized(err)) return unauthorized()
      throw err
    }
    return handler(request, { user, orgId })
  }
}

/**
 * Auth + default-org + OWNER gate — for owner-only org management routes
 * (portal shares, members, invites). Members and non-members get a 403; only the
 * org owner reaches the handler. Composes withOrg, so the 401 contract is shared.
 */
export function withOwner(
  handler: (request: Request, ctx: OwnerContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return withOrg(async (request, { user, orgId }) => {
    if ((await getOrgRole(orgId, user.id)) !== 'OWNER') return forbidden()
    return handler(request, { user, orgId, role: 'OWNER' })
  })
}
