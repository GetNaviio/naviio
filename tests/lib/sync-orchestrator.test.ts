/**
 * Sync orchestrator — lock/cooldown semantics on the in-memory path (no
 * REDIS_URL in tests). Each test uses a distinct orgId: cooldown keys are
 * module-level and persist across tests in this file by design.
 *
 * Factories must not reference module consts (hoisting) — handles come from
 * jest.requireMock.
 */
jest.mock('@/lib/prisma', () => ({ prisma: { integration: { findMany: jest.fn() } } }))
jest.mock('@/lib/integrations/plaid', () => ({ syncTransactions: jest.fn() }))
jest.mock('@/lib/integrations/stripe', () => ({ syncStripeData: jest.fn(), captureMrrSnapshot: jest.fn().mockResolvedValue(1) }))
jest.mock('@/lib/integrations/quickbooks', () => ({ syncQuickBooksTransactions: jest.fn() }))
jest.mock('@/lib/integrations/xero', () => ({ syncXeroTransactions: jest.fn() }))

const { syncTransactions: plaidSync } = jest.requireMock('@/lib/integrations/plaid') as { syncTransactions: jest.Mock }
const { syncStripeData: stripeSync, captureMrrSnapshot } = jest.requireMock('@/lib/integrations/stripe') as {
  syncStripeData: jest.Mock
  captureMrrSnapshot: jest.Mock
}
const { syncQuickBooksTransactions: qbSync } = jest.requireMock('@/lib/integrations/quickbooks') as { syncQuickBooksTransactions: jest.Mock }
const { syncXeroTransactions: xeroSync } = jest.requireMock('@/lib/integrations/xero') as { syncXeroTransactions: jest.Mock }

import { runSyncJob, runCronSweep, SYNCABLE_PROVIDERS } from '@/lib/sync/orchestrator'
import { prisma } from '@/lib/prisma'

beforeEach(() => {
  jest.clearAllMocks()
  captureMrrSnapshot.mockResolvedValue(1)
})

describe('runSyncJob', () => {
  it('dispatches to the right provider sync and reports synced', async () => {
    plaidSync.mockResolvedValue({ added: 3 })
    expect(await runSyncJob('org-a', 'PLAID')).toBe('synced')
    expect(plaidSync).toHaveBeenCalledWith('org-a')
  })

  it('coalesces bursts: an immediate second call is skipped by cooldown', async () => {
    plaidSync.mockResolvedValue({})
    expect(await runSyncJob('org-b', 'PLAID')).toBe('synced')
    expect(await runSyncJob('org-b', 'PLAID')).toBe('skipped_cooldown')
    expect(plaidSync).toHaveBeenCalledTimes(1)
  })

  it('isolates cooldowns per provider and per org', async () => {
    plaidSync.mockResolvedValue({})
    stripeSync.mockResolvedValue({})
    expect(await runSyncJob('org-c', 'PLAID')).toBe('synced')
    expect(await runSyncJob('org-c', 'STRIPE')).toBe('synced') // different provider
    expect(await runSyncJob('org-c2', 'PLAID')).toBe('synced') // different org
  })

  it('reports failed (never throws) when the provider sync rejects', async () => {
    qbSync.mockRejectedValue(new Error('QBO 503'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runSyncJob('org-d', 'QUICKBOOKS')).toBe('failed')
    error.mockRestore()
  })

  it('returns no_dispatch for providers without persistence (e.g. GUSTO)', async () => {
    expect(await runSyncJob('org-e', 'GUSTO')).toBe('no_dispatch')
  })
})

describe('runCronSweep', () => {
  it('sweeps every connected syncable integration with a bounded summary', async () => {
    const rows = [
      { orgId: 'sweep-1', provider: 'PLAID' },
      { orgId: 'sweep-2', provider: 'STRIPE' },
      { orgId: 'sweep-3', provider: 'XERO' },
    ]
    ;(prisma.integration.findMany as jest.Mock).mockResolvedValue(rows)
    plaidSync.mockResolvedValue({})
    stripeSync.mockResolvedValue({})
    xeroSync.mockResolvedValue({})

    const summary = await runCronSweep(2)
    expect(summary.total).toBe(3)
    expect(summary.synced).toBe(3)
    expect(summary.failed).toBe(0)

    // Only syncable providers are queried — live-fetch providers are excluded.
    expect(prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ provider: { in: SYNCABLE_PROVIDERS } }) }),
    )
  })

  it('one failing org never blocks the rest of the sweep', async () => {
    ;(prisma.integration.findMany as jest.Mock).mockResolvedValue([
      { orgId: 'sweep-f1', provider: 'PLAID' },
      { orgId: 'sweep-f2', provider: 'PLAID' },
    ])
    plaidSync.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({})
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    const summary = await runCronSweep(1)
    expect(summary.synced).toBe(1)
    expect(summary.failed).toBe(1)
    error.mockRestore()
  })
})
