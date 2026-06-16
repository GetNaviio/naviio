import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
  type RemovedTransaction,
} from 'plaid'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { getTokenForUser } from './refreshToken'
import { mapPlaidTransaction } from './plaid-map'

export { mapPlaidTransaction }

// ─── Client ──────────────────────────────────────────────────────────────────

function getClient(): PlaidApi {
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID ?? '',
          'PLAID-SECRET': process.env.PLAID_SECRET ?? '',
        },
      },
    }),
  )
}

/** Public webhook URL Plaid will POST item/transaction events to. */
function webhookUrl(): string | undefined {
  return process.env.PLAID_WEBHOOK_URL || undefined
}

/**
 * Page in our app that Plaid redirects back to after a bank's OAuth flow.
 * Required for OAuth institutions in production; must also be registered under
 * Developers → API → Allowed redirect URIs in the Plaid dashboard.
 */
function redirectUri(): string | undefined {
  return process.env.PLAID_REDIRECT_URI || undefined
}

// ─── Link / token exchange ─────────────────────────────────────────────────

/**
 * Create a Link token. Pass `accessToken` to produce an *update-mode* token,
 * used to re-authenticate an item that has gone into an ERROR state (re-link).
 */
export async function createLinkToken(
  orgId: string,
  accessToken?: string,
  accountSelection?: boolean,
) {
  const client = getClient()
  const res = await client.linkTokenCreate({
    user: { client_user_id: orgId },
    client_name: 'Naviio',
    // In update mode `products` must be omitted.
    // Transactions only — it returns balances + transactions across depository
    // AND credit-card accounts, which powers every Naviio view. Auth (account/
    // routing numbers) was requested but never used (no authGet); dropped for
    // data minimization (SEC-CFG-001). Re-add only if a money-movement feature
    // is built and actually calls authGet.
    products: accessToken ? undefined : [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: webhookUrl(),
    // Needed for OAuth banks; harmless when unset or for non-OAuth institutions.
    redirect_uri: redirectUri(),
    access_token: accessToken,
    // Update mode with account selection — lets the user add newly-available
    // accounts to an existing item (NEW_ACCOUNTS_AVAILABLE flow). Only valid
    // alongside an access_token.
    update: accessToken && accountSelection ? { account_selection_enabled: true } : undefined,
  })
  return res.data.link_token
}

export async function exchangePublicToken(orgId: string, publicToken: string) {
  const client = getClient()
  const res = await client.itemPublicTokenExchange({ public_token: publicToken })
  const { access_token: accessToken, item_id: itemId } = res.data

  // Duplicate / orphan Item detection (manage costs + reduce confusion). We keep
  // exactly one Plaid Item per org. If a DIFFERENT Item already exists for this
  // org, remove the old one at Plaid before the upsert overwrites it — otherwise
  // the previous Item is orphaned and keeps billing. Reconnecting the SAME Item
  // (same item_id) skips this. The prior access token is decrypted transparently.
  const prior = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'PLAID' } },
    select: { accessToken: true, itemId: true },
  })
  if (prior?.accessToken && prior.itemId && prior.itemId !== itemId) {
    try {
      await client.itemRemove({ access_token: prior.accessToken })
    } catch (err) {
      console.error('[plaid] failed to remove superseded item (continuing):', errMsg(err))
    }
  }

  await prisma.integration.upsert({
    where: { orgId_provider: { orgId, provider: 'PLAID' } },
    create: {
      orgId,
      provider: 'PLAID',
      status: 'CONNECTED',
      accessToken,
      itemId,
      lastSyncedAt: new Date(),
    },
    update: {
      status: 'CONNECTED',
      accessToken,
      itemId,
      // a fresh item starts a fresh cursor
      transactionCursor: null,
      lastSyncedAt: new Date(),
    },
  })

  // Pull initial history. Transactions can take a few seconds to be prepared
  // after linking (PRODUCT_NOT_READY → syncTransactions returns null), so retry a
  // few times. In production the SYNC_UPDATES_AVAILABLE webhook also backfills;
  // the retry makes the first connect populate data even without a reachable
  // webhook (e.g. local dev). Never let a sync hiccup break linking.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await syncTransactions(orgId)
      if (result !== null) break // ready (even if 0 new) — done
    } catch (err) {
      console.error('[plaid] initial sync failed (will retry on webhook):', errMsg(err))
      break
    }
    await new Promise((r) => setTimeout(r, 2500))
  }

  // Belt-and-braces: clear any pre-connect cached `hasData:false` so the
  // dashboard reflects the new connection even if the first sync returned no
  // transactions yet (a balance may already be available).
  await cache.delPattern(`org:${orgId}:*`).catch(() => {})

  return { accessToken, itemId }
}

// ─── Org lookup / status ─────────────────────────────────────────────────────

/** Resolve the owning org for an incoming webhook keyed by Plaid item_id. */
export async function getOrgIdByItemId(itemId: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: { itemId, provider: 'PLAID' },
    select: { orgId: true },
  })
  return integration?.orgId ?? null
}

/** Flag the Plaid integration as errored so the UI can prompt a re-link. */
export async function markItemError(orgId: string) {
  await prisma.integration.updateMany({
    where: { orgId, provider: 'PLAID' },
    data: { status: 'ERROR' },
  })
}

/**
 * Clear the Plaid integration's ERROR flag back to CONNECTED — used when Plaid
 * auto-repairs the login (LOGIN_REPAIRED webhook) or after a successful
 * update-mode re-link. Only touches items currently in ERROR.
 */
export async function clearItemError(orgId: string) {
  await prisma.integration.updateMany({
    where: { orgId, provider: 'PLAID', status: 'ERROR' },
    data: { status: 'CONNECTED' },
  })
}

/** Flag that new accounts are available to add (NEW_ACCOUNTS_AVAILABLE webhook). */
export async function markNewAccountsAvailable(orgId: string) {
  await prisma.integration.updateMany({
    where: { orgId, provider: 'PLAID' },
    data: { newAccountsAvailable: true },
  })
}

/** Clear the new-accounts flag (after the user adds accounts via update mode). */
export async function clearNewAccountsAvailable(orgId: string) {
  await prisma.integration.updateMany({
    where: { orgId, provider: 'PLAID' },
    data: { newAccountsAvailable: false },
  })
}

/**
 * Offboard a Plaid item — used when the user REVOKES access
 * (USER_PERMISSION_REVOKED, or Chase's USER_ACCOUNT_REVOKED). Revokes the item
 * at Plaid (best-effort) and tears down the local connection so we stop syncing.
 * Stored transactions follow the normal retention window (SEC-POL-003); they are
 * not deleted here. Distinct from markItemError, which prompts a re-link — a
 * revocation is an intentional disconnect, not a fixable error.
 */
export async function offboardPlaidItem(orgId: string): Promise<void> {
  await removePlaidItem(orgId)
  await prisma.integration.updateMany({
    where: { orgId, provider: 'PLAID' },
    data: {
      status: 'DISCONNECTED',
      accessToken: null,
      transactionCursor: null,
      itemId: null,
      newAccountsAvailable: false,
    },
  })
}

/**
 * Best-effort removal of the Plaid item at Plaid (revokes the access token).
 * Never throws — disconnect must succeed locally even if Plaid is unreachable.
 */
export async function removePlaidItem(orgId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'PLAID' } },
    select: { accessToken: true },
  })
  if (!integration?.accessToken) return
  try {
    await getClient().itemRemove({ access_token: integration.accessToken })
  } catch (err) {
    console.error('[plaid] itemRemove failed (token cleared locally anyway):', errMsg(err))
  }
}

// ─── Incremental sync (/transactions/sync + cursor) ──────────────────────────

/**
 * Incrementally sync transactions using Plaid's cursor-based endpoint and
 * persist them idempotently (upsert on the unique `externalId`). Stores the
 * cursor on the Integration row so each run only fetches deltas.
 */
export async function syncTransactions(
  orgId: string,
): Promise<{ added: number; modified: number; removed: number } | null> {
  const token = await getTokenForUser(orgId, 'plaid')
  if (!token) return null

  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'PLAID' } },
    select: { id: true, transactionCursor: true },
  })
  if (!integration) return null

  const client = getClient()
  let cursor = integration.transactionCursor ?? undefined
  const added: PlaidTransaction[] = []
  const modified: PlaidTransaction[] = []
  const removed: RemovedTransaction[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const res = await client.transactionsSync({ access_token: token, cursor })
      added.push(...res.data.added)
      modified.push(...res.data.modified)
      removed.push(...res.data.removed)
      cursor = res.data.next_cursor
      hasMore = res.data.has_more
    }
  } catch (err) {
    const code = plaidErrorCode(err)
    // Transactions aren't prepared yet (common right after linking). This is
    // TRANSIENT, not an item error — data arrives via the SYNC_UPDATES_AVAILABLE
    // webhook or the next sync. Return null so callers can retry; do NOT flag the
    // item as ERROR (that would falsely trigger the reconnect prompt).
    if (code === 'PRODUCT_NOT_READY') {
      console.warn('[plaid] transactions not ready yet — will sync on webhook/next run')
      return null
    }
    console.error('[plaid] transactionsSync failed:', errMsg(err))
    // Only a genuine auth failure means the user must re-link.
    if (code === 'ITEM_LOGIN_REQUIRED') await markItemError(orgId)
    throw err
  }

  // Persist deltas. Upserts make replays / webhook redeliveries idempotent.
  const upserts = [...added, ...modified].map((t) => {
    const data = mapPlaidTransaction(orgId, integration.id, t)
    return prisma.transaction.upsert({
      where: { orgId_externalId: { orgId, externalId: t.transaction_id } },
      create: data,
      update: data,
    })
  })

  const removedIds = removed.map((r) => r.transaction_id).filter(Boolean) as string[]

  await prisma.$transaction([
    ...upserts,
    ...(removedIds.length
      ? [prisma.transaction.deleteMany({ where: { orgId, externalId: { in: removedIds } } })]
      : []),
    prisma.integration.update({
      where: { id: integration.id },
      data: { transactionCursor: cursor, lastSyncedAt: new Date(), status: 'CONNECTED' },
    }),
  ])

  // New ledger data → every derived figure (metrics, P&L, model) is now stale.
  // Bust the org's cache so the dashboard/onboarding poll sees data immediately,
  // instead of a 15-min-cached `hasData:false` (the "stuck syncing until refresh"
  // bug). Covers all sync paths: connect, manual sync, webhook, cron, refresh.
  await cache.delPattern(`org:${orgId}:*`).catch(() => {})

  return { added: added.length, modified: modified.length, removed: removedIds.length }
}

// ─── Real-time refresh (PAID — Plaid /transactions/refresh) ──────────────────

/**
 * Force an on-demand transactions extraction via Plaid /transactions/refresh,
 * then pull the fresh data through the normal sync. This is the PAID real-time
 * feature — Plaid bills per successful refresh call, so callers must meter it on
 * credits. Throws 'PLAID_NOT_CONNECTED' when the org has no Plaid item so the
 * caller can avoid charging the user for a no-op.
 */
export async function refreshTransactions(
  orgId: string,
): Promise<{ synced: { added: number; modified: number; removed: number } | null }> {
  const token = await getTokenForUser(orgId, 'plaid')
  if (!token) throw new Error('PLAID_NOT_CONNECTED')
  const client = getClient()
  await client.transactionsRefresh({ access_token: token })
  // Best-effort immediate pull; additional deltas may arrive via the
  // SYNC_UPDATES_AVAILABLE webhook shortly after.
  const synced = await syncTransactions(orgId).catch(() => null)
  return { synced }
}

// ─── Balances + aggregator shape ─────────────────────────────────────────────

export async function fetchBalances(orgId: string) {
  const token = await getTokenForUser(orgId, 'plaid')
  if (!token) return null
  const client = getClient()
  const res = await client.accountsBalanceGet({ access_token: token })
  return res.data.accounts.map((a) => ({
    id: a.account_id,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    balance: a.balances.current ?? 0,
    available: a.balances.available ?? null,
    currency: a.balances.iso_currency_code ?? 'USD',
  }))
}

/**
 * Cash on hand = sum of DEPOSITORY account balances only (checking/savings).
 * Credit-card and loan accounts carry a positive "owed" balance that would
 * overstate available cash, so they're excluded. Returns null if Plaid isn't
 * connected.
 */
export async function getCashBalance(orgId: string): Promise<number | null> {
  const accounts = await fetchBalances(orgId)
  if (!accounts) return null
  return accounts
    .filter((a) => a.type === 'depository')
    .reduce((sum, a) => sum + a.balance, 0)
}

/**
 * Shape consumed by fetchAllData() in ./index.ts — reads `cashBalance` and
 * `accounts`. Reads persisted transactions (synced via webhook) rather than
 * re-pulling from Plaid on every dashboard load.
 */
export async function fetchPlaidData(orgId: string) {
  const [balancesRes, txRes] = await Promise.allSettled([
    fetchBalances(orgId),
    prisma.transaction.findMany({
      where: { orgId, source: 'plaid' },
      orderBy: { date: 'desc' },
      take: 250,
    }),
  ])

  const accounts = balancesRes.status === 'fulfilled' ? balancesRes.value : null
  // Depository accounts only — exclude credit/loan balances from cash on hand.
  const cashBalance = accounts
    ? accounts.filter((a) => a.type === 'depository').reduce((sum, a) => sum + a.balance, 0)
    : null
  const transactions = txRes.status === 'fulfilled' ? txRes.value : null

  return { source: 'plaid', cashBalance, accounts, transactions }
}

// ─── Webhook verification ─────────────────────────────────────────────────────

/**
 * Verify a Plaid webhook. Plaid signs each webhook body with an ES256 JWT in the
 * `Plaid-Verification` header. We fetch the public key for the JWT's `kid`,
 * verify the signature, then confirm the SHA-256 of the raw body matches the
 * `request_body_sha256` claim. Returns true only if everything checks out.
 *
 * `rawBody` MUST be the exact unparsed request body string.
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string | null,
): Promise<boolean> {
  if (!verificationHeader) return false
  try {
    const decodedHeader = jwt.decode(verificationHeader, { complete: true })
    const kid = decodedHeader?.header?.kid
    const alg = decodedHeader?.header?.alg
    if (!kid || alg !== 'ES256') return false

    const client = getClient()
    const keyRes = await client.webhookVerificationKeyGet({ key_id: kid })
    // Plaid returns a standard EC JWK (kty/crv/x/y); shape matches JsonWebKey.
    const jwk = keyRes.data.key as unknown as crypto.JsonWebKey

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    const claims = jwt.verify(verificationHeader, publicKey, {
      algorithms: ['ES256'],
      maxAge: '5m',
    }) as { request_body_sha256?: string }

    if (!claims.request_body_sha256) return false
    const bodyHash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(bodyHash),
      Buffer.from(claims.request_body_sha256),
    )
  } catch (err) {
    console.error('[plaid] webhook verification failed:', errMsg(err))
    return false
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Surface the *useful* part of a Plaid failure for logging. Plaid's SDK is
 * axios-based, so the actionable detail (error_type / error_code /
 * error_message) lives in `err.response.data`, not in the generic axios
 * message. Falls back to `err.message`. Never includes tokens/PII.
 */
/** Extract Plaid's `error_code` from an axios error, if present. */
export function plaidErrorCode(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { error_code?: string } } })?.response?.data
  return data?.error_code
}

export function errMsg(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
  if (data && typeof data === 'object') {
    const { error_type, error_code, error_message, request_id } = data as Record<string, string>
    if (error_code || error_message) {
      // request_id is the identifier Plaid support / the Item Debugger key on, so
      // always include it in the logged message when present.
      const base = [error_type, error_code, error_message].filter(Boolean).join(' | ')
      return request_id ? `${base} | request_id=${request_id}` : base
    }
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'unknown error'
}
