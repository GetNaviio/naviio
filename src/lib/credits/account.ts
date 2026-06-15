/**
 * Credit account operations — the authoritative balance + append-only ledger.
 *
 * Every change runs in a DB transaction that updates the running balance AND
 * writes a ledger entry, so the two never drift. `chargeCredits` is atomic and
 * refuses to go negative, which is what makes a metered feature safe to bill.
 */
import { prisma } from '@/lib/prisma'
import { costOf, type MeteredFeature } from '@/lib/credits/rates'

/** Thrown by chargeCredits when the org can't cover the cost. */
export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public balance: number) {
    super('INSUFFICIENT_CREDITS')
    this.name = 'InsufficientCreditsError'
  }
}

export async function getBalance(orgId: string): Promise<number> {
  const acct = await prisma.creditAccount.findUnique({ where: { orgId } })
  return acct?.balance ?? 0
}

/**
 * Add credits (purchase / grant / refund). Returns the new balance.
 */
export async function addCredits(
  orgId: string,
  amount: number,
  reason: 'purchase' | 'grant' | 'refund',
  meta: { feature?: string; stripeRef?: string } = {},
): Promise<number> {
  if (amount <= 0) throw new Error('addCredits amount must be positive')
  return prisma.$transaction(async (tx) => {
    await tx.creditAccount.upsert({ where: { orgId }, create: { orgId, balance: 0 }, update: {} })
    // Atomic increment — the DB does the math, so concurrent grants can't lose updates.
    const acct = await tx.creditAccount.update({ where: { orgId }, data: { balance: { increment: amount } } })
    await tx.creditLedgerEntry.create({
      data: { orgId, delta: amount, balanceAfter: acct.balance, reason, feature: meta.feature, stripeRef: meta.stripeRef },
    })
    return acct.balance
  })
}

/**
 * Atomically charge for `units` uses of a metered feature. Throws
 * InsufficientCreditsError (without mutating anything) when the balance is too
 * low. Returns the new balance on success.
 */
/**
 * Idempotently grant credits from a completed Stripe purchase. Keyed by the
 * Stripe session/payment id so webhook redeliveries (Stripe delivers at least
 * once) never double-credit. Returns whether it granted and the new balance.
 */
export async function recordPurchase(
  orgId: string,
  credits: number,
  stripeRef: string,
): Promise<{ granted: boolean; balance: number }> {
  const existing = await prisma.creditLedgerEntry.findFirst({ where: { stripeRef } })
  if (existing) return { granted: false, balance: await getBalance(orgId) }
  try {
    const balance = await addCredits(orgId, credits, 'purchase', { stripeRef })
    return { granted: true, balance }
  } catch (e) {
    // Concurrent webhook+confirm race: the unique constraint on stripeRef rejects
    // the second insert (Prisma P2002) — treat as already granted, not an error.
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { granted: false, balance: await getBalance(orgId) }
    }
    throw e
  }
}

/** DEV helper: set the balance to an exact value, recording the adjustment. */
export async function setBalanceForDev(orgId: string, target: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const acct = await tx.creditAccount.upsert({ where: { orgId }, create: { orgId, balance: 0 }, update: {} })
    const delta = target - acct.balance
    await tx.creditAccount.update({ where: { orgId }, data: { balance: target } })
    await tx.creditLedgerEntry.create({ data: { orgId, delta, balanceAfter: target, reason: 'grant', feature: 'dev_adjust' } })
    return target
  })
}

export async function chargeCredits(
  orgId: string,
  feature: MeteredFeature,
  units = 1,
): Promise<number> {
  const cost = costOf(feature) * units
  return prisma.$transaction(async (tx) => {
    await tx.creditAccount.upsert({ where: { orgId }, create: { orgId, balance: 0 }, update: {} })
    // Atomic conditional decrement: only succeeds if balance >= cost, so two
    // concurrent charges can't both pass a stale read or drive the balance negative.
    const res = await tx.creditAccount.updateMany({
      where: { orgId, balance: { gte: cost } },
      data: { balance: { decrement: cost } },
    })
    if (res.count === 0) {
      const acct = await tx.creditAccount.findUnique({ where: { orgId } })
      throw new InsufficientCreditsError(cost, acct?.balance ?? 0)
    }
    const acct = await tx.creditAccount.findUniqueOrThrow({ where: { orgId } })
    await tx.creditLedgerEntry.create({
      data: { orgId, delta: -cost, balanceAfter: acct.balance, reason: 'charge', feature },
    })
    return acct.balance
  })
}
