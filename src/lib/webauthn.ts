import jwt from 'jsonwebtoken'
import { headers } from 'next/headers'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server'
import { getJwtSecret } from './auth'

const APP_NAME = 'Naviio'
const CHALLENGE_TTL = 5 * 60 // seconds

export const REG_COOKIE = 'wa_reg_chal'
export const AUTH_COOKIE = 'wa_auth_chal'
export const LOGIN_COOKIE = 'wa_login_chal'   // passwordless login (discoverable)
export const SIGNUP_COOKIE = 'wa_signup_chal' // passwordless signup

/**
 * Relying Party identity, derived from NEXT_PUBLIC_BASE_URL. `rpID` is the bare
 * registrable domain (no scheme/port); `origin` is the full URL. Passkeys are
 * scoped to rpID, so it must be stable across environments (localhost in dev).
 */
export function rpConfig(): { rpName: string; rpID: string; origin: string } {
  const origin = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  let rpID = 'localhost'
  try {
    rpID = new URL(origin).hostname
  } catch {
    /* keep localhost */
  }
  return { rpName: APP_NAME, rpID, origin }
}

/**
 * RP config for the current request. In PRODUCTION it is pinned to
 * NEXT_PUBLIC_BASE_URL (a forged Host header must never change the RP ID). In
 * DEVELOPMENT it derives the rpID/origin from the request's actual Origin/Host
 * so passkeys work on whatever you're browsing (localhost, an alternate port,
 * or an ngrok tunnel) without flipping env vars.
 */
async function getRpConfig(): Promise<{ rpName: string; rpID: string; origin: string }> {
  if (process.env.NODE_ENV === 'production') return rpConfig()
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto') || 'http'
    const host = h.get('host')
    const origin = h.get('origin') || (host ? `${proto}://${host}` : '')
    if (origin) {
      return { rpName: APP_NAME, rpID: new URL(origin).hostname, origin }
    }
  } catch {
    /* fall through to env-based */
  }
  return rpConfig()
}

// ─── Short-lived challenge cookie (signed, httpOnly) ───────────────────────────
export function signChallenge(challenge: string, scope: 'reg' | 'auth'): string {
  return jwt.sign({ challenge, scope }, getJwtSecret(), { expiresIn: CHALLENGE_TTL })
}

export function readChallenge(token: string | undefined, scope: 'reg' | 'auth'): string | null {
  if (!token) return null
  try {
    const d = jwt.verify(token, getJwtSecret()) as { challenge?: string; scope?: string }
    if (d.scope !== scope || !d.challenge) return null
    return d.challenge
  } catch {
    return null
  }
}

// Registration needs to carry the generated WebAuthn user handle from the
// options step into the verify step (alongside the challenge).
export function signRegContext(challenge: string, waUserID: string): string {
  return jwt.sign({ challenge, waUserID, scope: 'reg' }, getJwtSecret(), { expiresIn: CHALLENGE_TTL })
}

export function readRegContext(token: string | undefined): { challenge: string; waUserID: string } | null {
  if (!token) return null
  try {
    const d = jwt.verify(token, getJwtSecret()) as { challenge?: string; waUserID?: string; scope?: string }
    if (d.scope !== 'reg' || !d.challenge || !d.waUserID) return null
    return { challenge: d.challenge, waUserID: d.waUserID }
  } catch {
    return null
  }
}

export function challengeCookie(name: string, token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=${token}; Path=/; Max-Age=${CHALLENGE_TTL}; HttpOnly; SameSite=Lax${secure}`
}

export function clearChallengeCookie(name: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

// ─── Registration ──────────────────────────────────────────────────────────────
export async function buildRegistrationOptions(input: {
  userName: string
  excludeCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[]
}) {
  const { rpName, rpID } = await getRpConfig()
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: input.userName,
    attestationType: 'none',
    excludeCredentials: input.excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })
}

export async function checkRegistration(input: {
  response: RegistrationResponseJSON
  expectedChallenge: string
}) {
  const { rpID, origin } = await getRpConfig()
  return verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })
}

// Signup carries the WebAuthn user handle AND the email from options → verify.
export function signSignupContext(challenge: string, waUserID: string, email: string): string {
  return jwt.sign({ challenge, waUserID, email, scope: 'signup' }, getJwtSecret(), { expiresIn: CHALLENGE_TTL })
}

export function readSignupContext(token: string | undefined): { challenge: string; waUserID: string; email: string } | null {
  if (!token) return null
  try {
    const d = jwt.verify(token, getJwtSecret()) as { challenge?: string; waUserID?: string; email?: string; scope?: string }
    if (d.scope !== 'signup' || !d.challenge || !d.waUserID || !d.email) return null
    return { challenge: d.challenge, waUserID: d.waUserID, email: d.email }
  } catch {
    return null
  }
}

// ─── Authentication ─────────────────────────────────────────────────────────────
/** Passwordless (discoverable-credential) authentication options — no email and
 *  no allowCredentials, so the authenticator offers any resident passkey for this
 *  RP. The returned credential identifies the user on the server. */
export async function buildDiscoverableAuthenticationOptions() {
  const { rpID } = await getRpConfig()
  // 'required', not 'preferred': passwordless mints a FULL session from this one
  // ceremony, so it must be true 2FA — possession (the key) + user verification
  // (PIN/biometric). With 'preferred', a UV=false assertion (e.g. a bare
  // security-key tap) would be single-factor possession.
  return generateAuthenticationOptions({ rpID, userVerification: 'required' })
}

export async function buildAuthenticationOptions(input: {
  allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[]
}) {
  const { rpID } = await getRpConfig()
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: input.allowCredentials,
    userVerification: 'preferred',
  })
}

export async function checkAuthentication(input: {
  response: AuthenticationResponseJSON
  expectedChallenge: string
  credential: WebAuthnCredential
  /** Enforce UV server-side. MUST be true for passwordless login (the assertion
   *  is both factors); false for the post-password second-factor ceremony
   *  (password already provided factor 1). The client cannot be trusted to
   *  honor the options' userVerification hint — enforce at verify. */
  requireUserVerification?: boolean
}) {
  const { rpID, origin } = await getRpConfig()
  return verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: input.credential,
    requireUserVerification: input.requireUserVerification ?? false,
  })
}

/** Parse the stored CSV transports column back into the typed array. */
export function parseTransports(csv: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined
  return csv.split(',').filter(Boolean) as AuthenticatorTransportFuture[]
}
