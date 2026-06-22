import Stripe from 'stripe'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import * as cache from '@/lib/cache'
import { mapStripeCharge, mapStripeFee } from './stripe-map'

export { mapStripeCharge, mapStripeFee }

const STRIPE_CONNECT_AUTH = 'https://connect.stripe.com/oauth/authorize'
const STRIPE_CONNECT_TOKEN = 'https://connect.stripe.com/oauth/token'

function getClient(secretKey?: string): Stripe {
  const key = secretKey ?? process.env.STRIPE_SECRET_KEY ?? ''
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

// ─── Connect (OAuth) ──────────────────────────────────────────────────────────

export function getConnectAuthUrl(state: string, redirectUri?: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID ?? '',
    // Stripe requires 'read_write' for self-serve OAuth; 'read_only' needs a
    // support request to enable. We only ever READ, so the extra grant is unused.
    scope: 'read_write',
    // Prefer the live request origin (passed by the route) so the user always
    // lands back on the host they started from — a stale env can't send them to
    // a dead tunnel. Env values are a fallback only. This URI must be registered
    // in Stripe Dashboard → Connect → OAuth → Redirects.
    redirect_uri:
      redirectUri ||
      process.env.STRIPE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/auth/stripe/callback`,
    state,
  })
  return `${STRIPE_CONNECT_AUTH}?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(STRIPE_CONNECT_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_secret: process.env.STRIPE_SECRET_KEY ?? '',
      grant_type: 'authorization_code',
      code,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Stripe Connect exchange failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    stripeUserId: data.stripe_user_id as string,
    scope: data.scope as string,
    tokenType: data.token_type as string,
  }
}

/**
 * Best-effort de-authorization of a Connect-linked account (revokes our access
 * at Stripe). No-op for env-key mode (no connected account / client id). Never
 * throws — local disconnect must still succeed.
 */
export async function deauthorizeStripe(orgId: string): Promise<void> {
  const clientId = process.env.STRIPE_CLIENT_ID
  if (!clientId) return
  const integration = await getIntegration(orgId)
  const account = integration?.realmId
  if (!account) return
  try {
    await getClient().oauth.deauthorize({ client_id: clientId, stripe_user_id: account })
  } catch (err) {
    console.error('[stripe] deauthorize failed (token cleared locally anyway):', err instanceof Error ? err.message : err)
  }
}

// ─── Client / org resolution ──────────────────────────────────────────────────

async function getIntegration(orgId: string) {
  return prisma.integration.findUnique({
    where: { orgId_provider: { orgId, provider: 'STRIPE' } },
  })
}

/**
 * Build a Stripe client for an org. For a Connect-linked account the stored
 * `accessToken` is that account's restricted key; otherwise we fall back to the
 * platform's own `STRIPE_SECRET_KEY`. Returns null when neither is available.
 */
async function getStripeForUser(orgId: string): Promise<Stripe | null> {
  const integration = await getIntegration(orgId)
  const key = integration?.accessToken ?? process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return getClient(key)
}

/** Resolve the owning org for a Connect webhook keyed by connected account id. */
export async function getOrgIdByStripeAccount(account: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: { realmId: account, provider: 'STRIPE' },
    select: { orgId: true },
  })
  return integration?.orgId ?? null
}

// ─── Period helper ──────────────────────────────────────────────────────────

const DAY = 86_400
const sinceTs = (days: number) => Math.floor(Date.now() / 1000) - days * DAY

// ─── Metrics ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

// Statuses that actually contribute recurring revenue. Everything else
// (canceled, unpaid, incomplete, trialing, …) contributes 0 MRR.
const PAYING_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'past_due'])

/** Months covered by one billing period, honoring interval + interval_count. */
function periodMonths(interval: string | undefined, count: number): number {
  switch (interval) {
    case 'year':  return 12 * count
    case 'month': return count
    case 'week':  return (count * 7) / 30.44
    case 'day':   return count / 30.44
    default:      return count
  }
}

/**
 * Active discount on a subscription as a monthly adjustment: a multiplicative
 * factor (percent_off) and a flat monthly cents reduction (amount_off, prorated
 * to a month by `monthsForAmountOff`). One-time ('once') coupons are ignored —
 * they don't reduce ongoing MRR. Reads `discounts[0]` (or legacy `discount`).
 */
function subscriptionDiscount(
  sub: Stripe.Subscription,
  monthsForAmountOff: number,
): { factor: number; monthlyOffCents: number } {
  const d = sub as unknown as {
    discount?: { coupon?: Stripe.Coupon } | null
    discounts?: Array<string | { coupon?: Stripe.Coupon }> | null
  }
  const first = d.discount ?? (Array.isArray(d.discounts) ? d.discounts.find((x) => typeof x !== 'string') : null)
  const coupon = first && typeof first !== 'string' ? first.coupon : null
  if (!coupon || coupon.duration === 'once') return { factor: 1, monthlyOffCents: 0 }
  const factor = coupon.percent_off ? 1 - coupon.percent_off / 100 : 1
  const months = monthsForAmountOff > 0 ? monthsForAmountOff : 1
  const monthlyOffCents = coupon.amount_off ? coupon.amount_off / months : 0
  return { factor, monthlyOffCents }
}

/**
 * Per-subscription monthly MRR (major units). Honors interval_count and weekly/
 * daily plans, applies recurring coupons (percent_off / amount_off), and returns
 * 0 for non-paying statuses so churn/cohort math is correct. NOTE: tiered/usage
 * prices (null unit_amount) contribute 0 until `price.tiers` is expanded.
 */
export function subscriptionMrr(sub: Stripe.Subscription): number {
  if (!PAYING_STATUSES.has(sub.status)) return 0
  const grossCents = sub.items.data.reduce((s, item) => {
    const amt = item.price.unit_amount ?? 0
    const qty = item.quantity ?? 1
    const months = periodMonths(item.price.recurring?.interval, item.price.recurring?.interval_count ?? 1)
    return s + (months > 0 ? (amt * qty) / months : 0)
  }, 0)
  // Prorate any amount_off coupon to a month using the first item's period.
  const firstItem = sub.items.data[0]
  const offMonths = periodMonths(firstItem?.price.recurring?.interval, firstItem?.price.recurring?.interval_count ?? 1)
  const { factor, monthlyOffCents } = subscriptionDiscount(sub, offMonths)
  const netCents = Math.max(grossCents * factor - monthlyOffCents, 0)
  return netCents / 100
}

/** Monthly recurring revenue (major units) from active subscriptions, + ARR. */
export async function fetchMRR(orgId: string) {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  let mrr = 0
  let activeSubscriptions = 0
  for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
    mrr += subscriptionMrr(sub)
    activeSubscriptions++
  }
  mrr = round2(mrr)
  return { mrr, arr: round2(mrr * 12), activeSubscriptions }
}

// ─── MRR snapshots (for NRR / waterfall / cohorts) ──────────────────────────

const ymOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const ymFromUnix = (ts: number) => ymOf(new Date(ts * 1000))

export interface SubscriptionMrrRow {
  subscriptionId: string
  customerId: string | null
  mrr: number
  status: string
  cohortMonth: string
}

/** List every subscription with its MRR + cohort month (paginated, no 100 cap). */
export async function listSubscriptionMrr(orgId: string): Promise<SubscriptionMrrRow[]> {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return []
  const rows: SubscriptionMrrRow[] = []
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    rows.push({
      subscriptionId: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
      mrr: subscriptionMrr(sub),
      status: sub.status,
      cohortMonth: ymFromUnix(sub.start_date ?? sub.created),
    })
  }
  return rows
}

/**
 * Capture this month's per-subscription MRR snapshot. Idempotent: upserts on
 * (orgId, subscriptionId, period), so running it repeatedly within a month just
 * refreshes the current values. Returns the number of subscriptions captured.
 */
export async function captureMrrSnapshot(orgId: string): Promise<number> {
  const rows = await listSubscriptionMrr(orgId)
  if (rows.length === 0) return 0
  const period = ymOf(new Date())
  for (const r of rows) {
    await prisma.mrrSnapshot.upsert({
      where: { orgId_subscriptionId_period: { orgId, subscriptionId: r.subscriptionId, period } },
      create: { orgId, period, subscriptionId: r.subscriptionId, customerId: r.customerId, mrr: r.mrr, status: r.status, cohortMonth: r.cohortMonth },
      update: { mrr: r.mrr, status: r.status, customerId: r.customerId },
    })
  }
  return rows.length
}

/** MRR as a single number. */
export async function getMRR(orgId: string): Promise<number | null> {
  return (await fetchMRR(orgId))?.mrr ?? null
}

/** ARR = MRR × 12. */
export async function getARR(orgId: string): Promise<number | null> {
  return (await fetchMRR(orgId))?.arr ?? null
}

export async function fetchRevenue(orgId: string, days = 30) {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  let grossCents = 0
  let refundCents = 0
  for await (const c of stripe.charges.list({ created: { gte: sinceTs(days) }, limit: 100 })) {
    if (c.paid && !c.refunded) grossCents += c.amount
    refundCents += c.amount_refunded ?? 0
  }
  const grossRevenue = grossCents / 100
  const refunds = refundCents / 100
  return { grossRevenue, refunds, netRevenue: grossRevenue - refunds }
}

/**
 * Logo churn rate (pure): cancellations in the window ÷ the subscriber base at the
 * START of the window. Start base = active now − joined during window + cancelled
 * during window. Returns 0–1; 0 when the start base is empty.
 */
export function logoChurnRate(activeNow: number, joinedInWindow: number, canceledInWindow: number): number {
  const baseAtStart = activeNow - joinedInWindow + canceledInWindow
  if (baseAtStart <= 0) return 0
  return canceledInWindow / baseAtStart
}

/**
 * Monthly logo churn over the period. Cancellations are filtered by when they
 * ACTUALLY cancelled (`canceled_at`/`ended_at`) — Stripe can't query that
 * server-side, so we list cancelled subs and filter in code — not by `created`
 * (which is the join date and systematically undercounts churn). The base is the
 * start-of-window subscriber count, not active+cancelled.
 */
export async function getChurnRate(orgId: string, days = 30): Promise<number | null> {
  const c = await churnCounts(orgId, days)
  if (!c) return null
  return logoChurnRate(c.activeNow, c.joinedInWindow, c.canceledInWindow)
}

/** Shared counts for churn: active now, joined-in-window, cancelled-in-window. */
async function churnCounts(orgId: string, days: number) {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  const windowStart = sinceTs(days)
  let activeNow = 0
  let joinedInWindow = 0
  for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
    activeNow++
    if ((sub.start_date ?? sub.created) >= windowStart) joinedInWindow++
  }
  let canceledInWindow = 0
  for await (const sub of stripe.subscriptions.list({ status: 'canceled', limit: 100 })) {
    const ended = sub.canceled_at ?? sub.ended_at
    if (ended && ended >= windowStart) canceledInWindow++
  }
  return { activeNow, joinedInWindow, canceledInWindow }
}

export async function fetchChurn(orgId: string, days = 30) {
  const c = await churnCounts(orgId, days)
  if (!c) return null
  return { canceledCount: c.canceledInWindow }
}

/**
 * Lifetime value ≈ ARPU / monthly churn rate, where ARPU = MRR / active subs.
 * Returns null when churn is zero (LTV undefined / infinite).
 */
export async function getLTV(orgId: string): Promise<number | null> {
  const mrr = await fetchMRR(orgId)
  if (!mrr || mrr.activeSubscriptions === 0) return null
  const churn = await getChurnRate(orgId)
  if (!churn || churn <= 0) return null
  const arpu = mrr.mrr / mrr.activeSubscriptions
  return arpu / churn
}

/** Gross revenue bucketed by calendar month for the last `months` months. */
export async function getRevenueByMonth(
  orgId: string,
  months = 12,
): Promise<{ month: string; revenue: number }[] | null> {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null

  const buckets = new Map<string, number>()
  for await (const c of stripe.charges.list({ created: { gte: sinceTs(months * 31) }, limit: 100 })) {
    if (!c.paid) continue
    const net = (c.amount - (c.amount_refunded ?? 0)) / 100  // net of partial refunds
    if (net <= 0) continue
    const key = new Date(c.created * 1000).toISOString().slice(0, 7) // YYYY-MM (UTC)
    buckets.set(key, (buckets.get(key) ?? 0) + net)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }))
}

/** Total customers, new this month, and subscriptions churned this month. */
export async function getCustomerMetrics(orgId: string) {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  const now = new Date()
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
  let total = 0, newThisMonth = 0, churnedThisMonth = 0
  for await (const _ of stripe.customers.list({ limit: 100 })) { void _; total++ }
  for await (const _ of stripe.customers.list({ created: { gte: monthStart }, limit: 100 })) { void _; newThisMonth++ }
  for await (const _ of stripe.subscriptions.list({ status: 'canceled', created: { gte: monthStart }, limit: 100 })) { void _; churnedThisMonth++ }
  return { total, newThisMonth, churnedThisMonth }
}

/** Raw charge data for a date range. */
export async function getCharges(orgId: string, startDate: Date, endDate: Date) {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  const res = await stripe.charges.list({
    created: {
      gte: Math.floor(startDate.getTime() / 1000),
      lte: Math.floor(endDate.getTime() / 1000),
    },
    limit: 100,
  })
  return res.data
}

/** Refund rate over the period: total refunded / gross charged (0–1). */
export async function getRefundRate(orgId: string, days = 30): Promise<number | null> {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null
  let gross = 0, refunded = 0
  for await (const c of stripe.charges.list({ created: { gte: sinceTs(days) }, limit: 100 })) {
    gross += c.amount
    refunded += c.amount_refunded ?? 0
  }
  if (gross === 0) return 0
  return refunded / gross
}

export async function fetchCustomers(orgId: string) {
  const m = await getCustomerMetrics(orgId)
  return m ? { total: m.total } : null
}

// ─── Sync + cache ─────────────────────────────────────────────────────────────

export interface StripeMetrics {
  mrr: number | null
  arr: number | null
  churnRate: number | null
  ltv: number | null
  refundRate: number | null
  revenueByMonth: { month: string; revenue: number }[] | null
  customers: { total: number; newThisMonth: number; churnedThisMonth: number } | null
  syncedAt: string
}

const metricsKey = (orgId: string) => `org:${orgId}:stripe:metrics`

/**
 * Compute the metric bundle from Stripe and cache it. Works with either a
 * connected-account token OR the platform env key (no Integration row required).
 */
async function computeStripeMetrics(orgId: string): Promise<StripeMetrics | null> {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null

  const [mrr, churnRate, ltv, refundRate, revenueByMonth, customers] = await Promise.allSettled([
    fetchMRR(orgId),
    getChurnRate(orgId),
    getLTV(orgId),
    getRefundRate(orgId),
    getRevenueByMonth(orgId),
    getCustomerMetrics(orgId),
  ])
  const v = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
  const mrrVal = v(mrr)

  const metrics: StripeMetrics = {
    mrr: mrrVal?.mrr ?? null,
    arr: mrrVal?.arr ?? null,
    churnRate: v(churnRate),
    ltv: v(ltv),
    refundRate: v(refundRate),
    revenueByMonth: v(revenueByMonth),
    customers: v(customers),
    syncedAt: new Date().toISOString(),
  }
  await cache.set(metricsKey(orgId), metrics, cache.TTL.LONG)
  return metrics
}

/**
 * Persist recent charges into the Transaction table (only when a connected
 * Integration row exists) and refresh the cached metric bundle. Used by the
 * webhook + cron. Returns the metric bundle.
 */
export async function syncStripeData(orgId: string): Promise<StripeMetrics | null> {
  const stripe = await getStripeForUser(orgId)
  if (!stripe) return null

  const integration = await getIntegration(orgId)
  if (integration) {
    try {
      // Paginate so the ledger isn't capped at the first 100 charges. Expand the
      // balance transaction so we can read the Stripe processing fee per charge.
      const upserts = []
      let feeCount = 0
      for await (const c of stripe.charges.list({ created: { gte: sinceTs(90) }, limit: 100, expand: ['data.balance_transaction', 'data.invoice'] })) {
        if (!c.paid) continue
        const data = mapStripeCharge(orgId, integration.id, c)  // GROSS revenue, net of refunds (ASC 606-10-32)
        upserts.push(prisma.transaction.upsert({ where: { orgId_externalId: { orgId, externalId: c.id } }, create: data, update: data }))
        // Record the processing fee as its own expense row (gross→net bridge).
        const fee = mapStripeFee(orgId, integration.id, c)
        if (fee) {
          upserts.push(prisma.transaction.upsert({ where: { orgId_externalId: { orgId, externalId: fee.externalId } }, create: fee, update: fee }))
          feeCount++
        }
      }
      if (upserts.length) await prisma.$transaction(upserts)
      console.warn(`[stripe] sync persisted ${upserts.length} row(s) — incl. ${feeCount} processing-fee expense(s) (last 90d) for org ${orgId}`)
    } catch (err) {
      console.error('[stripe] charge persistence failed:', errMsg(err))
    }
    // Persist payouts so bank deposits can be reconciled against them (a payout
    // landing in the bank must not be counted as revenue a second time). Raw SQL
    // + best-effort; never blocks the sync. Resilient if the table isn't migrated.
    try {
      for await (const po of stripe.payouts.list({ arrival_date: { gte: sinceTs(90) }, limit: 100 })) {
        const arrival = new Date(po.arrival_date * 1000)
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO "StripePayout" ("id", "orgId", "payoutId", "amountCents", "arrivalDate", "createdAt")
          VALUES (${randomUUID()}, ${orgId}, ${po.id}, ${po.amount}, ${arrival}, now())
          ON CONFLICT ("orgId", "payoutId") DO UPDATE SET "amountCents" = ${po.amount}, "arrivalDate" = ${arrival}
        `)
      }
    } catch (err) {
      console.error('[stripe] payout sync failed (continuing):', errMsg(err))
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncedAt: new Date(), status: 'CONNECTED' },
    })
    // Persisting new Stripe charges into the ledger changes the Overview's
    // cash-basis revenue/burn. Bust the broad org cache (not just the Stripe
    // metrics key) so /api/metrics recomputes — otherwise the Overview keeps
    // showing a pre-Stripe snapshot (e.g. $0 revenue) while the Revenue tab,
    // which reads the fresh Stripe metrics, already shows the income.
    await cache.delPattern(`org:${orgId}:*`).catch(() => {})
  }

  return computeStripeMetrics(orgId)
}

/** Cached metrics if present, otherwise a fresh compute. */
export async function getStripeMetrics(orgId: string): Promise<StripeMetrics | null> {
  const cached = await cache.get<StripeMetrics>(metricsKey(orgId))
  if (cached) return cached
  return computeStripeMetrics(orgId)
}

// ─── Aggregator shape (consumed by ./index.ts fetchAllData) ────────────────────

export async function fetchStripeData(orgId: string) {
  // Persist Stripe charges into the ledger so the cash-basis P&L / Overview see
  // Stripe revenue — not just the live Revenue-tab metrics. Without this, a
  // manual "Sync Now" refreshes the Revenue cards but leaves Overview revenue at
  // $0 until the cron runs. Never blocks the metric fetch below.
  await syncStripeData(orgId).catch((e) => console.error('[stripe] ledger persist on sync failed:', errMsg(e)))

  const [mrr, revenue, churn] = await Promise.allSettled([
    fetchMRR(orgId),
    fetchRevenue(orgId),
    fetchChurn(orgId),
  ])
  return {
    source: 'stripe',
    mrr: mrr.status === 'fulfilled' ? mrr.value : null,
    revenue: revenue.status === 'fulfilled' ? revenue.value : null,
    churn: churn.status === 'fulfilled' ? churn.value : null,
  }
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

export async function verifyWebhookSignature(body: string, signature: string): Promise<Stripe.Event> {
  const stripe = getClient()
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET ?? '')
}

const RELEVANT_EVENTS = new Set<string>([
  'payment_intent.succeeded',
  'charge.refunded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

/**
 * React to a verified Stripe event.
 *
 * - **Connect** events carry an `account` (the connected-account id we stored as
 *   Integration.realmId). We resolve the org and re-sync (persist charges +
 *   refresh cached metrics); a cancellation also raises an Alert.
 * - **Platform / own-account** events (env-key mode) have no `account`, so there's
 *   no org to scope to. We invalidate the cached Stripe metrics so every
 *   dashboard recomputes fresh on its next load.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!RELEVANT_EVENTS.has(event.type)) return

  const account = event.account ?? null
  const orgId = account ? await getOrgIdByStripeAccount(account) : null

  if (!orgId) {
    // Own-account (env key): bust cached metrics; dashboards recompute on reload.
    await cache.delPattern('org:*:stripe:metrics')
    return
  }

  await syncStripeData(orgId)
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await prisma.alert.create({
      data: {
        orgId,
        type: 'stripe_subscription_canceled',
        message: `A Stripe subscription was cancelled (customer ${String(sub.customer)}).`,
        severity: 'WARNING',
      },
    })
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Surface a short, PII-free error message for logs. */
function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'unknown error'
}
