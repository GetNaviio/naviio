import { prisma } from '@/lib/prisma'
import type { Integration, IntegrationProvider } from '@prisma/client'

const REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry

// ── Provider refresh config (table-driven) ───────────────────────────────────
//
// Every OAuth provider refreshes the same way: POST x-www-form-urlencoded to a
// token endpoint with grant_type=refresh_token, credentials either as a Basic
// auth header or in the body. One generic implementation + one config row per
// provider replaces five copy-pasted functions; adding a provider is one line.

type RefreshConfig = {
  /** Token endpoint URL (function — some depend on env, e.g. Gusto demo vs prod) */
  url: () => string
  /** 'basic' = client id/secret in Authorization header; 'body' = in form body */
  auth: 'basic' | 'body'
  clientIdEnv: string
  clientSecretEnv: string
  /** Human-readable name for error messages */
  label: string
}

const REFRESH_CONFIG: Partial<Record<IntegrationProvider, RefreshConfig>> = {
  QUICKBOOKS: {
    url: () => 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    auth: 'basic',
    clientIdEnv: 'QB_CLIENT_ID',
    clientSecretEnv: 'QB_CLIENT_SECRET',
    label: 'QuickBooks',
  },
  XERO: {
    url: () => 'https://identity.xero.com/connect/token',
    auth: 'basic',
    clientIdEnv: 'XERO_CLIENT_ID',
    clientSecretEnv: 'XERO_CLIENT_SECRET',
    label: 'Xero',
  },
  GUSTO: {
    url: () =>
      process.env.GUSTO_ENV === 'production'
        ? 'https://api.gusto.com/oauth/token'
        : 'https://api.gusto-demo.com/oauth/token',
    auth: 'body',
    clientIdEnv: 'GUSTO_CLIENT_ID',
    clientSecretEnv: 'GUSTO_CLIENT_SECRET',
    label: 'Gusto',
  },
  GOHIGHLEVEL: {
    url: () => 'https://services.leadconnectorhq.com/oauth/token',
    auth: 'body',
    clientIdEnv: 'GHL_CLIENT_ID',
    clientSecretEnv: 'GHL_CLIENT_SECRET',
    label: 'GHL',
  },
  ADP: {
    url: () => 'https://accounts.adp.com/auth/oauth/v2/token',
    auth: 'basic',
    clientIdEnv: 'ADP_CLIENT_ID',
    clientSecretEnv: 'ADP_CLIENT_SECRET',
    label: 'ADP',
  },
  GOOGLE_ADS: {
    url: () => 'https://oauth2.googleapis.com/token',
    auth: 'body',
    clientIdEnv: 'GOOGLE_ADS_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_ADS_CLIENT_SECRET',
    label: 'Google Ads',
  },
  // PLAID: tokens don't expire
  // STRIPE: API keys don't expire
  // SHOPIFY: tokens don't expire (permanent)
  // META_ADS: long-lived token (~60d), re-issued on reconnect — no refresh endpoint
}

async function refreshWithConfig(
  cfg: RefreshConfig,
  integration: Integration,
): Promise<Partial<Integration>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refreshToken ?? '',
  })

  if (cfg.auth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(
      `${process.env[cfg.clientIdEnv]}:${process.env[cfg.clientSecretEnv]}`,
    ).toString('base64')}`
  } else {
    body.set('client_id', process.env[cfg.clientIdEnv] ?? '')
    body.set('client_secret', process.env[cfg.clientSecretEnv] ?? '')
  }

  const res = await fetch(cfg.url(), { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`${cfg.label} refresh failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    // Some providers (e.g. ADP) may not rotate the refresh token — keep the old one.
    refreshToken: data.refresh_token ?? integration.refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// In-flight refresh dedup: concurrent requests for the same integration share
// one refresh instead of racing (duplicate provider calls + last-write-wins on
// the stored token). Per-process only — across instances the 5-min buffer makes
// collisions harmless (both refreshes yield valid tokens) — but within a
// process this removes the common race entirely.
const inFlight = new Map<string, Promise<string>>()

/**
 * Returns a valid access token for the given integration,
 * auto-refreshing if the token is expired or about to expire.
 */
export async function getValidToken(integration: Integration): Promise<string> {
  if (!integration.accessToken) throw new Error(`No access token for ${integration.provider}`)

  const needsRefresh =
    integration.expiresAt &&
    integration.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS

  if (!needsRefresh) return integration.accessToken

  const cfg = REFRESH_CONFIG[integration.provider]
  if (!cfg) return integration.accessToken // provider doesn't need refresh

  const existing = inFlight.get(integration.id)
  if (existing) return existing

  const refresh = (async () => {
    const updates = await refreshWithConfig(cfg, integration)
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken:  updates.accessToken  ?? undefined,
        refreshToken: updates.refreshToken ?? undefined,
        expiresAt:    updates.expiresAt    ?? undefined,
        lastSyncedAt: new Date(),
      },
    })
    return updates.accessToken ?? integration.accessToken!
  })()

  inFlight.set(integration.id, refresh)
  try {
    return await refresh
  } finally {
    inFlight.delete(integration.id)
  }
}

// Map the lowercase app-side provider id callers use → the Prisma enum value.
const PROVIDER_ENUM: Record<string, IntegrationProvider> = {
  plaid: 'PLAID',
  quickbooks: 'QUICKBOOKS',
  stripe: 'STRIPE',
  xero: 'XERO',
  gusto: 'GUSTO',
  adp: 'ADP',
  shopify: 'SHOPIFY',
  ghl: 'GOHIGHLEVEL',
  gohighlevel: 'GOHIGHLEVEL',
}

/**
 * Load the integration from DB and return a valid token in one call.
 */
export async function getTokenForUser(orgId: string, provider: string): Promise<string | null> {
  // Callers pass the lowercase id ('xero'); the DB stores the enum ('XERO').
  const enumProvider = PROVIDER_ENUM[provider.toLowerCase()] ?? (provider as IntegrationProvider)

  // Flag the integration for reconnect (surfaced by the status route's
  // `reconnect` map → existing banner) and fail soft. updateMany returns a
  // count, not the row, so it never tries to decrypt the stored token on the
  // way back (which is exactly what may be failing here).
  const flagForReconnect = () =>
    prisma.integration
      .updateMany({ where: { orgId, provider: enumProvider }, data: { status: 'ERROR' } })
      .catch(() => {})

  let integration
  try {
    integration = await prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: enumProvider } },
    })
  } catch (err) {
    // The row read decrypts the stored token transparently. If TOKEN_ENCRYPTION_KEY
    // is missing or was rotated, that decrypt throws here — degrade to a
    // reconnect prompt instead of bubbling a 500 / silently hiding the UI.
    console.error(`Token read failed for ${provider} (likely encryption key mismatch):`, err)
    await flagForReconnect()
    return null
  }

  if (!integration?.accessToken) return null
  try {
    return await getValidToken(integration)
  } catch (err) {
    console.error(`Token refresh failed for ${provider}:`, err)
    await flagForReconnect()
    return null
  }
}
