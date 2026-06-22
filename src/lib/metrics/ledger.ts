import { prisma } from '@/lib/prisma'
import { Prisma, type IntegrationProvider } from '@prisma/client'
import type { DatedLedgerTxn } from './compute'
import { VENDOR_OVERRIDE_PREFIX, type CategoryOverrides } from './classify'
import { reconcileStripePayouts, type PayoutRef } from './stripe-payout-reconcile'

/**
 * Load an org's normalized transaction ledger (Plaid + Stripe + any synced
 * accounting transactions) for the metric engine. Returns the minimal fields the
 * classifier/compute functions need.
 */
export async function loadLedger(orgId: string, since?: Date): Promise<DatedLedgerTxn[]> {
  // Select is built as a plain object + cast so the new recognition* columns
  // compile before `prisma generate` runs on the build host (the sandbox can't
  // fetch the engine to regenerate). The result is cast to the concrete row shape.
  const findArgs = {
    where: { orgId, ...(since ? { date: { gte: since } } : {}) },
    select: {
      source: true,
      type: true,
      amount: true,
      category: true,
      description: true,
      merchantName: true,
      date: true,
      // Stable provider id — the key user classification tags (TxnClassification)
      // are stored under, so overrides can be applied consistently downstream.
      externalId: true,
      // Revenue-recognition window (set on multi-month subscription charges) so
      // the income statement can recognize that revenue ratably.
      recognitionStart: true,
      recognitionEnd: true,
    },
    orderBy: { date: 'asc' as const },
  }
  const rows = (await prisma.transaction.findMany(
    findArgs as Parameters<typeof prisma.transaction.findMany>[0],
  )) as unknown as Array<{
    source: string
    type: string
    amount: number
    category: string | null
    description: string
    merchantName: string | null
    date: Date
    externalId: string
    recognitionStart: Date | null
    recognitionEnd: Date | null
  }>
  return rows.map((r) => ({
    source: r.source,
    type: r.type as 'CREDIT' | 'DEBIT',
    amount: r.amount,
    category: r.category,
    description: r.description,
    merchantName: r.merchantName,
    date: r.date,
    externalId: r.externalId,
    recognitionStart: r.recognitionStart,
    recognitionEnd: r.recognitionEnd,
  }))
}

/**
 * User classification overrides (COGS/OpEx/Other tags) keyed by externalId.
 * EVERY endpoint that runs the gross-margin classifier must apply these — a
 * tag that moves a transaction in one tab but not another destroys trust in
 * all of them.
 */
export async function classificationOverrides(orgId: string): Promise<Record<string, 'COGS' | 'OPEX' | 'OTHER'>> {
  const rows = await prisma.txnClassification.findMany({
    where: { orgId, expenseClass: { not: null } },
    select: { externalId: true, expenseClass: true },
  })
  return Object.fromEntries(rows.map((r) => [r.externalId, r.expenseClass!]))
}

/**
 * User category overrides (externalId → display label) — the "fix the AI"
 * write path's read side. Applied by every consumer that shows a category
 * (income statement, P&L drill-down, transactions list) so one fix moves the
 * transaction in every view at once.
 */
export async function categoryOverrides(orgId: string): Promise<CategoryOverrides> {
  const rows = await prisma.txnClassification.findMany({
    where: { orgId, category: { not: null } },
    select: { externalId: true, category: true },
    orderBy: { updatedAt: 'asc' }, // most-recent fix wins (applied last)
  })
  const byVendor: Record<string, string> = {}
  const byTxn: Record<string, string> = {}
  for (const r of rows) {
    if (r.externalId.startsWith(VENDOR_OVERRIDE_PREFIX)) {
      byVendor[r.externalId.slice(VENDOR_OVERRIDE_PREFIX.length)] = r.category!
    } else {
      byTxn[r.externalId] = r.category!
    }
  }
  return { byVendor, byTxn }
}

/** UTC start-of-year — stable YTD boundary regardless of server timezone. */
export function startOfYearUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
}

const PRIMARY_SOURCES = new Set(['plaid', 'stripe'])

/**
 * Apply the source-of-truth hierarchy: when the ledger contains any Plaid/Stripe
 * rows, use ONLY those (raw bank/payment truth). Otherwise fall back to the
 * accounting transactions (quickbooks/xero). This prevents double-counting the
 * same bank activity when a customer connects both a bank and an accounting tool.
 */
export function primaryLedger<T extends { source: string }>(txns: T[]): T[] {
  const hasPrimary = txns.some((t) => PRIMARY_SOURCES.has(t.source))
  return hasPrimary ? txns.filter((t) => PRIMARY_SOURCES.has(t.source)) : txns
}

/**
 * The composition every metric endpoint actually wants: load the ledger for a
 * window, then apply the source-of-truth hierarchy. One name for the pattern
 * previously copy-pasted as `primaryLedger(await loadLedger(orgId, since))`
 * across the metrics, P&L, model, commentary, and insights routes.
 */
export async function loadPrimaryLedger(orgId: string, since?: Date): Promise<DatedLedgerTxn[]> {
  const ledger = primaryLedger(await loadLedger(orgId, since))
  // Reconcile bank deposits against real Stripe payouts so a payout isn't counted
  // as revenue twice (it's already counted as the underlying charges).
  const payouts = await loadStripePayouts(orgId, since)
  return reconcileStripePayouts<DatedLedgerTxn>(ledger, payouts)
}

/** Stripe payouts for the window. Resilient: returns [] if the table isn't
 *  migrated yet, so reconciliation degrades to the description fallback rather
 *  than breaking the whole metrics pipeline. */
async function loadStripePayouts(orgId: string, since?: Date): Promise<PayoutRef[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ amountCents: number; arrivalDate: Date }>>(Prisma.sql`
      SELECT "amountCents", "arrivalDate" FROM "StripePayout"
      WHERE "orgId" = ${orgId}${since ? Prisma.sql` AND "arrivalDate" >= ${since}` : Prisma.empty}
    `)
    return rows.map((r) => ({ amountCents: Number(r.amountCents), arrivalDate: r.arrivalDate }))
  } catch {
    return []
  }
}

/**
 * Set of CONNECTED providers for an org — shared by routes that branch on
 * what's connected (source labels, fallback selection, connect prompts).
 */
export async function connectedProviders(orgId: string): Promise<Set<IntegrationProvider>> {
  const rows = await prisma.integration.findMany({
    where: { orgId, status: 'CONNECTED' },
    select: { provider: true },
  })
  return new Set(rows.map((r) => r.provider))
}

/** UTC start of the month `months` ago (0 = current month). */
export function monthsAgoUTC(months: number, d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1))
}

/** Which raw sources the ledger actually contains (for source labeling). */
export async function ledgerSources(orgId: string): Promise<Set<string>> {
  const rows = await prisma.transaction.findMany({
    where: { orgId },
    select: { source: true },
    distinct: ['source'],
  })
  return new Set(rows.map((r) => r.source))
}
