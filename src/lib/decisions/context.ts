/**
 * Financial context adapter — maps the live metric engine into the inputs the
 * Decision Engine needs. This is the grounding layer: the numbers a decision is
 * built on come from here (the real deduplicated ledger + cash), never a model.
 */
import { loadPrimaryLedger, categoryOverrides, connectedProviders, startOfYearUTC, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface FinancialContext {
  cashBalance: number | null
  /** Mean monthly net cash flow over available history (negative = burn). */
  avgMonthlyNet: number
  /** Average monthly net outflow across cash-negative months (0 if cash-positive). */
  monthlyBurn: number
  runwayMonths: number | null
  ytdRevenue: number
  ytdNetIncome: number
  netMargin: number | null
  /** Months of transaction history available (drives confidence). */
  historyMonths: number
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  hasData: boolean
  generatedAt: string
}

export async function getFinancialContext(orgId: string): Promise<FinancialContext> {
  const connected = await connectedProviders(orgId)
  const sources = {
    plaid: connected.has('PLAID'),
    stripe: connected.has('STRIPE'),
    quickbooks: connected.has('QUICKBOOKS'),
    xero: connected.has('XERO'),
  }

  const [ledger, catOverrides] = await Promise.all([
    loadPrimaryLedger(orgId, monthsAgoUTC(12)),
    categoryOverrides(orgId),
  ])

  const is = incomeStatement(ledger, startOfYearUTC(), undefined, catOverrides)
  const cf = cashFlow(ledger)
  const cashBalance = sources.plaid ? await getCashBalance(orgId).catch(() => null) : null

  const months = cf.byMonth
  const avgMonthlyNet = months.length ? round2(months.reduce((s, m) => s + m.net, 0) / months.length) : 0
  const runway = cashBalance != null && cf.burnRate > 0 ? runwayMonths(cashBalance, cf.burnRate) : null

  return {
    cashBalance,
    avgMonthlyNet,
    monthlyBurn: cf.burnRate,
    runwayMonths: runway,
    ytdRevenue: is.totalIncome,
    ytdNetIncome: is.netIncome,
    netMargin: is.netMargin,
    historyMonths: months.length,
    sources,
    hasData: ledger.length > 0 || cashBalance != null,
    generatedAt: new Date().toISOString(),
  }
}

/** Confidence from how much history backs the answer. */
export function confidenceFromHistory(historyMonths: number): 'high' | 'medium' | 'low' {
  if (historyMonths >= 6) return 'high'
  if (historyMonths >= 3) return 'medium'
  return 'low'
}
