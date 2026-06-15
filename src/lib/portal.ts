/**
 * Client portal (CFO Suite): build the read-only financial snapshot a shared
 * link exposes, and the token helpers.
 *
 * The snapshot is computed by the SAME metric engine the dashboard uses
 * (loadPrimaryLedger + incomeStatement/cashFlow over the deduplicated ledger),
 * so a client sees exactly the numbers the CFO sees — no separate, driftable
 * "public" computation. `scopes` gates which sections are returned.
 */
import { createHash } from 'crypto'
import { loadPrimaryLedger, startOfYearUTC, categoryOverrides, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'
import type { Branding } from '@/lib/branding'
import { DEFAULT_BRANDING } from '@/lib/branding'

export const hashPortalToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

export type PortalScope = 'pnl' | 'cash' | 'kpis'
export const ALL_SCOPES: PortalScope[] = ['pnl', 'cash', 'kpis']

export function parseScopes(csv: string): PortalScope[] {
  const set = new Set(csv.split(',').map((s) => s.trim()))
  return ALL_SCOPES.filter((s) => set.has(s))
}

export interface PortalSnapshot {
  orgName: string
  branding: Branding
  scopes: PortalScope[]
  pnl?: { totalIncome: number; totalExpenses: number; netIncome: number; netMargin: number | null }
  cash?: { balance: number | null; netCashFlow: number; burnRate: number; runwayMonths: number | null }
  kpis?: { grossMargin: number | null; monthlyBurn: number; ytdRevenue: number; ytdNet: number }
  generatedAt: string
}

/**
 * Compose the snapshot for one org, honoring the link's scopes. Mirrors
 * /api/metrics so the portal and dashboard never disagree.
 */
export async function buildPortalSnapshot(
  orgId: string,
  orgName: string,
  scopes: PortalScope[],
  branding: Branding = DEFAULT_BRANDING,
): Promise<PortalSnapshot> {
  const [ledger, catOverrides] = await Promise.all([
    loadPrimaryLedger(orgId, monthsAgoUTC(12)),
    categoryOverrides(orgId),
  ])
  const is = incomeStatement(ledger, startOfYearUTC(), undefined, catOverrides)
  const cf = cashFlow(ledger)
  // Cash balance only matters for the cash + kpis sections — skip the Plaid
  // call when neither is shared.
  const needsCash = scopes.includes('cash') || scopes.includes('kpis')
  const cashBalance = needsCash ? await getCashBalance(orgId).catch(() => null) : null
  const runway = cashBalance != null && cf.burnRate > 0 ? runwayMonths(cashBalance, cf.burnRate) : null

  const snap: PortalSnapshot = { orgName, branding, scopes, generatedAt: new Date().toISOString() }

  if (scopes.includes('pnl')) {
    snap.pnl = {
      totalIncome: is.totalIncome,
      totalExpenses: is.totalExpenses,
      netIncome: is.netIncome,
      netMargin: is.netMargin,
    }
  }
  if (scopes.includes('cash')) {
    snap.cash = {
      balance: cashBalance,
      netCashFlow: cf.netCashFlow,
      burnRate: cf.burnRate,
      runwayMonths: runway != null && Number.isFinite(runway) ? runway : null,
    }
  }
  if (scopes.includes('kpis')) {
    snap.kpis = {
      grossMargin: is.netMargin, // headline margin; full gross-margin model is dashboard-only
      monthlyBurn: cf.burnRate,
      ytdRevenue: is.totalIncome,
      ytdNet: is.netIncome,
    }
  }
  return snap
}
