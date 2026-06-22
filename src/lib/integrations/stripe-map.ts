import type Stripe from 'stripe'
import type { Prisma } from '@prisma/client'

/**
 * Map a Stripe charge to a Naviio Transaction row. Pure + side-effect free so it
 * can be unit tested without the Stripe client or a DB.
 *
 * Stripe charges represent revenue flowing INTO the business, so they map to a
 * CREDIT. Amounts are in the smallest currency unit (cents) — we convert to a
 * major-unit decimal and store the magnitude, NET of any refunds (contra-revenue,
 * ASC 606-10-32) so the income statement never overstates revenue. Re-syncing on
 * a `charge.refunded` webhook updates the stored amount to the new net.
 */
export function mapStripeCharge(
  orgId: string,
  integrationId: string,
  c: Stripe.Charge,
): Prisma.TransactionUncheckedCreateInput {
  // Sales tax collected is a pass-through LIABILITY, not revenue (ASC 606). When
  // Stripe Tax is used, `charge.amount` includes it, so strip the invoice tax out
  // of recognized revenue. Capped at the post-refund amount; on partial refunds
  // the tax reversal is approximate (the remitted tax DEBIT isn't double-counted
  // because remittances are bank rows, not Stripe rows).
  const grossCents = Math.max((c.amount ?? 0) - (c.amount_refunded ?? 0), 0)
  const taxCents = Math.min(invoiceTaxCents(c), grossCents)
  const netCents = grossCents - taxCents
  const win = recognitionWindow(c)
  return {
    orgId,
    integrationId,
    externalId: c.id,
    date: new Date(c.created * 1000),
    amount: netCents / 100,
    currency: (c.currency ?? 'usd').toUpperCase(),
    description: c.description ?? c.statement_descriptor ?? 'Stripe charge',
    category: 'REVENUE',
    merchantName: c.billing_details?.name ?? null,
    accountId: null,
    type: 'CREDIT',
    source: 'stripe',
    // Multi-month subscription → recognize revenue ratably across the service
    // period (deferred revenue). NULL for monthly/one-time charges. Cast: the
    // generated client picks up recognition* after `prisma generate`.
    recognitionStart: win?.start ?? null,
    recognitionEnd: win?.end ?? null,
  } as Prisma.TransactionUncheckedCreateInput
}

const RECOGNITION_MIN_DAYS = 45 // longer than a month ⇒ spread (annual / quarterly)

/** The expanded invoice on a charge (`expand: ['data.invoice']`), or null. */
function invoiceOf(c: Stripe.Charge): Stripe.Invoice | null {
  const inv = (c as unknown as { invoice?: string | Stripe.Invoice | null }).invoice
  return inv && typeof inv !== 'string' ? inv : null
}

/** Sales tax (cents) collected on the charge's invoice, 0 when none/unexpanded. */
function invoiceTaxCents(c: Stripe.Charge): number {
  const inv = invoiceOf(c)
  if (!inv) return 0
  const tax = (inv as unknown as { tax?: number | null }).tax
  return typeof tax === 'number' && tax > 0 ? tax : 0
}

/**
 * The service period a subscription charge covers, from the longest invoice line
 * period (`expand: ['data.invoice']`). Returns null for one-time charges, charges
 * with no invoice, or single-month periods — those recognize on the charge date.
 */
function recognitionWindow(c: Stripe.Charge): { start: Date; end: Date } | null {
  const inv = invoiceOf(c)
  if (!inv) return null // not expanded / no invoice
  let best: { s: number; e: number } | null = null
  for (const line of inv.lines?.data ?? []) {
    const p = line.period
    if (!p?.start || !p?.end || p.end <= p.start) continue
    if (!best || p.end - p.start > best.e - best.s) best = { s: p.start, e: p.end }
  }
  if (!best || (best.e - best.s) / 86_400 <= RECOGNITION_MIN_DAYS) return null
  return { start: new Date(best.s * 1000), end: new Date(best.e * 1000) }
}

/**
 * Map a charge's Stripe processing fee to a DEBIT expense row, so revenue stays
 * GROSS and the fee is a visible P&L line ("Payment Processing Fees") — the
 * gross→net bridge. The fee lives on the charge's expanded balance_transaction
 * (`expand: ['data.balance_transaction']`). Returns null when there's no fee or
 * the balance transaction wasn't expanded. externalId is the charge id + '_fee'
 * so it upserts idempotently alongside the revenue row.
 */
export function mapStripeFee(
  orgId: string,
  integrationId: string,
  c: Stripe.Charge,
): Prisma.TransactionUncheckedCreateInput | null {
  const bt = c.balance_transaction
  if (!bt || typeof bt === 'string') return null // not expanded → can't read the fee
  const feeCents = bt.fee ?? 0
  if (feeCents <= 0) return null
  return {
    orgId,
    integrationId,
    externalId: `${c.id}_fee`,
    date: new Date(c.created * 1000),
    amount: feeCents / 100,
    currency: (bt.currency ?? c.currency ?? 'usd').toUpperCase(),
    description: 'Stripe processing fee',
    category: 'Payment Processing Fees',
    merchantName: 'Stripe',
    accountId: null,
    type: 'DEBIT',
    source: 'stripe',
  }
}
