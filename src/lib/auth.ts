import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import { prisma } from './prisma'
import * as cache from '@/lib/cache'
import type { User } from '@/types'

/**
 * Resolve the JWT signing secret. Fails closed in production: a missing secret
 * must never silently fall back to a public default (that would let anyone forge
 * sessions). Resolved per-call (not at import) so a build never throws.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production')
  }
  return 'dev-secret-change-in-production'
}
const COOKIE_NAME = 'markup_session'
const SESSION_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds

// Short-lived token issued after a valid password but BEFORE the second factor.
// It carries mfaPending:true and is NOT a usable session — verifyToken /
// getSessionUser reject it. The MFA challenge exchanges it for a real session.
export const PREAUTH_COOKIE_NAME = 'markup_mfa_pending'
const PREAUTH_DURATION = 5 * 60 // 5 minutes in seconds

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_DURATION })
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string
      email: string
      mfaPending?: boolean
    }
    // A pre-auth (mfaPending) token must never be accepted as a full session.
    if (decoded.mfaPending) return null
    return { userId: decoded.userId, email: decoded.email }
  } catch {
    return null
  }
}

/** Sign a short-lived pre-auth token used between password check and MFA. */
export function signPreAuthToken(payload: { userId: string; email: string }): string {
  return jwt.sign({ ...payload, mfaPending: true }, getJwtSecret(), {
    expiresIn: PREAUTH_DURATION,
  })
}

/** Verify a pre-auth token. Returns null unless it is a valid mfaPending token. */
export function verifyPreAuthToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string
      email: string
      mfaPending?: boolean
    }
    if (!decoded.mfaPending) return null
    return { userId: decoded.userId, email: decoded.email }
  } catch {
    return null
  }
}

// `Secure` only in production. Over http://localhost (dev) browsers DROP Secure
// cookies, which silently breaks the session. The OAuth/WebAuthn helpers already
// gate it this way; the session + pre-auth headers must match.
const COOKIE_SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : ''

/** Set-Cookie header that stores the short-lived pre-auth token. */
export function makePreAuthCookieHeader(token: string): string {
  return `${PREAUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${PREAUTH_DURATION}; HttpOnly; SameSite=Lax${COOKIE_SECURE}`
}

/** Set-Cookie header that immediately clears the pre-auth cookie. */
export function clearPreAuthCookieHeader(): string {
  return `${PREAUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${COOKIE_SECURE}`
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  })
}

/** Raw Set-Cookie header string — use this in route handlers for reliability */
export function makeSessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_DURATION}; HttpOnly; SameSite=Lax${COOKIE_SECURE}`
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// ─── Session revocation ────────────────────────────────────────────────────────
// JWTs are stateless: without this, "logout" only deletes the browser cookie and
// a stolen token stays valid for its full 7-day lifetime. On logout the token's
// hash goes on a denylist (Redis when configured — cross-instance; in-memory in
// dev) with TTL equal to its remaining lifetime, and every session check
// consults the list. Fail-open by design: a Redis outage must not lock everyone
// out; the tradeoff is documented in docs/SECURITY_AUDIT.md.

function tokenKey(token: string): string {
  return `revoked:${createHash('sha256').update(token).digest('hex')}`
}

/** Revoke a session token for the remainder of its lifetime (called on logout). */
export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null
    const remaining = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : SESSION_DURATION
    if (remaining <= 0) return // already expired — nothing to revoke
    await cache.set(tokenKey(token), '1', remaining)
  } catch {
    // best-effort — never block logout
  }
}

async function isRevoked(token: string): Promise<boolean> {
  try {
    return (await cache.get(tokenKey(token))) !== null
  } catch {
    return false // fail open
  }
}

const DEMO_USER: User = {
  id: 'demo_user',
  email: 'demo@markupai.com',
  name: 'Eric Franco',
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  // Logged-out tokens are revoked for their remaining lifetime.
  if (await isRevoked(token)) return null

  // Demo user — no DB lookup needed
  if (payload.userId === 'demo_user') return DEMO_USER

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, deletedAt: true },
    })
    // Account flagged for deletion → access is disabled immediately, even during
    // the 30-day purge grace window.
    if (!user || user.deletedAt) return null
    return { id: user.id, email: user.email, name: user.name }
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<User> {
  const user = await getSessionUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

/**
 * True if the account has a second factor configured — TOTP enabled OR at least
 * one registered passkey. This is the canonical 2FA check used by the login flow
 * and the Plaid Link gate, so a passkey counts the same as an authenticator app.
 */
export async function userHasSecondFactor(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } })
  if (u?.mfaEnabled) return true
  const passkeys = await prisma.credential.count({ where: { userId } })
  return passkeys > 0
}

/**
 * Find-or-create a user for FEDERATED sign-in (Google, WorkOS SSO) and link the
 * provider account. Returns null if the matched account is flagged for deletion.
 * Federated identity is itself strong auth, so callers mint a full session
 * directly (the app's TOTP/passkey second factor still gates bank connection).
 */
export async function upsertFederatedUser(input: {
  email: string
  name?: string | null
  image?: string | null
  provider: string
  providerAccountId: string
}): Promise<{ id: string; email: string } | null> {
  const email = input.email.toLowerCase()

  // 1) Already linked via this provider account?
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } },
    select: { user: { select: { id: true, email: true, deletedAt: true } } },
  })
  if (linked?.user) {
    return linked.user.deletedAt ? null : { id: linked.user.id, email: linked.user.email }
  }

  // 2) Existing user with this email? Link the new provider account to it.
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, deletedAt: true } })
  if (user?.deletedAt) return null
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: input.name ?? null, image: input.image ?? null },
      select: { id: true, email: true, deletedAt: true },
    })
  }
  await prisma.account.create({
    data: { userId: user.id, type: 'oauth', provider: input.provider, providerAccountId: input.providerAccountId },
  })
  return { id: user.id, email: user.email }
}

/**
 * Resolve the org the user is working in.
 *
 * Order: explicit activeOrgId (validated — a revoked membership falls back
 * safely) → an org they own → an org they were invited into → create one.
 * Multi-user note: invited members may not OWN any org; their membership
 * resolves before auto-creation so accepting an invite doesn't spawn a
 * phantom personal org.
 */
export async function getDefaultOrgId(userId: string): Promise<string> {
  // The built-in demo user is hardcoded and never written by the login flow.
  // Ensure it exists so the Organization.userId foreign key is satisfied
  // (otherwise org creation fails on a fresh database).
  if (userId === DEMO_USER.id) {
    await prisma.user.upsert({
      where: { id: DEMO_USER.id },
      create: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name },
      update: {},
    })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, activeOrgId: true },
  })

  // Explicit selection (set by invite-accept / org switch), validated each time.
  if (user?.activeOrgId) {
    const id = user.activeOrgId
    const [owned, membership] = await Promise.all([
      prisma.organization.findFirst({ where: { id, userId }, select: { id: true } }),
      prisma.orgMember.findUnique({ where: { orgId_userId: { orgId: id, userId } }, select: { orgId: true } }),
    ])
    if (owned || membership) return id
    // Stale pointer (kicked from the org, org deleted) — clear and fall through.
    await prisma.user.update({ where: { id: userId }, data: { activeOrgId: null } }).catch(() => {})
  }

  const org = await prisma.organization.findFirst({ where: { userId } })
  if (org) return org.id

  // No owned org — an invited member resolves to the org they joined.
  const membership = await prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { orgId: true },
  })
  if (membership) return membership.orgId

  const created = await prisma.organization.create({
    data: { name: user?.name ?? user?.email ?? 'My Organization', userId },
  })
  return created.id
}
