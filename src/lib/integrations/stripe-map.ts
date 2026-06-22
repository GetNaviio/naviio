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
  const netCents = Math.max((c.amount ?? 0) - (c.amount_refunded ?? 0), 0)
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
  }
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
