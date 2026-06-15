/**
 * Credit account invariants with a mocked Prisma layer. These pin the
 * CONTRACTS the routes rely on: atomic conditional decrement (no overdraft),
 * ledger written in the same transaction, and P2002-based purchase idempotency.
 *
 * jest.mock factories are hoisted above module consts — the mock objects are
 * created inside the factory and retrieved via jest.requireMock.
 */
jest.mock('@/lib/prisma', () => {
  const tx = {
    creditAccount: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    creditLedgerEntry: { create: jest.fn() },
  }
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    creditAccount: { findUnique: jest.fn() },
    creditLedgerEntry: { findFirst: jest.fn() },
  }
  return { prisma, __tx: tx }
})

type MockFns = {
  prisma: {
    $transaction: jest.Mock
    creditAccount: { findUnique: jest.Mock }
    creditLedgerEntry: { findFirst: jest.Mock }
  }
  __tx: {
    creditAccount: {
      upsert: jest.Mock
      update: jest.Mock
      updateMany: jest.Mock
      findUnique: jest.Mock
      findUniqueOrThrow: jest.Mock
    }
    creditLedgerEntry: { create: jest.Mock }
  }
}
const { prisma: prismaMock, __tx: tx } = jest.requireMock('@/lib/prisma') as MockFns

import { chargeCredits, addCredits, recordPurchase, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks wipes implementations set in the factory — restore the
  // transaction passthrough each test.
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('chargeCredits', () => {
  it('uses an atomic conditional decrement (balance >= cost in the WHERE)', async () => {
    tx.creditAccount.updateMany.mockResolvedValue({ count: 1 })
    tx.creditAccount.findUniqueOrThrow.mockResolvedValue({ balance: 7 })

    const balance = await chargeCredits('org1', 'realtime_refresh')
    expect(balance).toBe(7)

    const cost = costOf('realtime_refresh')
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', balance: { gte: cost } },
      data: { balance: { decrement: cost } },
    })
    // Ledger entry written in the SAME transaction, with the post-charge balance.
    expect(tx.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: 'org1', delta: -cost, balanceAfter: 7, reason: 'charge' }),
    })
  })

  it('throws InsufficientCreditsError without writing a ledger entry', async () => {
    tx.creditAccount.updateMany.mockResolvedValue({ count: 0 }) // conditional decrement refused
    tx.creditAccount.findUnique.mockResolvedValue({ balance: 1 })

    await expect(chargeCredits('org1', 'realtime_refresh')).rejects.toThrow(InsufficientCreditsError)
    expect(tx.creditLedgerEntry.create).not.toHaveBeenCalled()
  })
})

describe('addCredits', () => {
  it('rejects non-positive amounts', async () => {
    await expect(addCredits('org1', 0, 'grant')).rejects.toThrow(/positive/)
    await expect(addCredits('org1', -5, 'refund')).rejects.toThrow(/positive/)
  })

  it('increments atomically and records the ledger entry', async () => {
    tx.creditAccount.update.mockResolvedValue({ balance: 110 })
    const balance = await addCredits('org1', 10, 'refund', { feature: 'realtime_refresh' })
    expect(balance).toBe(110)
    expect(tx.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: 10, balanceAfter: 110, reason: 'refund', feature: 'realtime_refresh' }),
    })
  })
})

describe('recordPurchase (idempotency)', () => {
  it('grants once for a new stripeRef', async () => {
    prismaMock.creditLedgerEntry.findFirst.mockResolvedValue(null)
    tx.creditAccount.update.mockResolvedValue({ balance: 50 })
    const r = await recordPurchase('org1', 50, 'cs_123')
    expect(r).toEqual({ granted: true, balance: 50 })
  })

  it('is a no-op for an already-recorded stripeRef (webhook redelivery)', async () => {
    prismaMock.creditLedgerEntry.findFirst.mockResolvedValue({ id: 'led_1' })
    prismaMock.creditAccount.findUnique.mockResolvedValue({ balance: 50 })
    const r = await recordPurchase('org1', 50, 'cs_123')
    expect(r).toEqual({ granted: false, balance: 50 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('treats a P2002 race (concurrent webhook + confirm) as already-granted', async () => {
    prismaMock.creditLedgerEntry.findFirst.mockResolvedValue(null) // stale read
    prismaMock.$transaction.mockRejectedValueOnce({ code: 'P2002' }) // unique stripeRef rejected the insert
    prismaMock.creditAccount.findUnique.mockResolvedValue({ balance: 50 })
    const r = await recordPurchase('org1', 50, 'cs_123')
    expect(r).toEqual({ granted: false, balance: 50 })
  })

  it('rethrows non-P2002 failures (so the webhook can 500 → Stripe retries)', async () => {
    prismaMock.creditLedgerEntry.findFirst.mockResolvedValue(null)
    prismaMock.$transaction.mockRejectedValueOnce(new Error('db down'))
    await expect(recordPurchase('org1', 50, 'cs_123')).rejects.toThrow('db down')
  })
})
