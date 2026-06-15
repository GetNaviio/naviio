export interface User {
  id: string
  email: string
  name: string | null
}

export interface Integration {
  id: string
  provider: 'plaid' | 'stripe' | 'quickbooks' | 'xero' | 'gusto' | 'adp' | 'shopify' | 'ghl' | 'meta-ads' | 'google-ads'
  status: 'active' | 'error' | 'disconnected' | 'pending'
  connectedAt: string
  lastSyncAt: string | null
}

export interface PLDataPoint {
  month: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  ebitda: number
}

export interface CashFlowDataPoint {
  month: string
  cashIn: number
  cashOut: number
  netCashFlow: number
  balance: number
}

export interface RevenueMetrics {
  mrr: number
  arr: number
  mrrGrowth: number
  newMrr: number
  expansionMrr: number
  churnedMrr: number
  churnRate: number
  ltv: number
  arpu: number
  totalCustomers: number
  newCustomers: number
  churnedCustomers: number
}

export interface RevenueDataPoint {
  month: string
  mrr: number
  newMrr: number
  expansionMrr: number
  churnedMrr: number
  customers: number
}

export interface ExpenseCategory {
  category: string
  amount: number
  percentage: number
  trend: number
  color: string
}

export interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  category: string
  merchantName: string | null
  type: 'debit' | 'credit'
  source: string
  /** Stable provider id — key for user reclassification */
  externalId?: string | null
  /** Expense rows can be reclassified */
  editable?: boolean
  /** Category was fixed by the user (override active) */
  overridden?: boolean
}

export interface KPIMetric {
  name: string
  value: number
  unit: string
  trend: number
  trendPeriod: string
  target?: number
  description: string
}

export interface Alert {
  id: string
  type: 'low_cash' | 'anomaly' | 'milestone' | 'churn_risk' | 'revenue_drop'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  createdAt: string
  readAt: string | null
}

export interface ForecastScenario {
  id: string
  name: string
  type: 'bear' | 'base' | 'bull' | 'custom'
  assumptions: {
    growthMultiplier: number
    churnMultiplier: number
    opexGrowthMultiplier: number
  }
}

export interface ForecastPoint {
  month: string
  historicalMrr: number | null
  historicalRevenue: number | null
  bear: number | null
  base: number | null
  bull: number | null
  confidence: number | null
  isHistorical: boolean
}

export interface ForecastSummary {
  mrr: number
  arr: number
  runway: number
  cashBalance: number
  cumulativeRevenue: number
}

export interface ForecastResult {
  data: ForecastPoint[]
  summary: { bear: ForecastSummary; base: ForecastSummary; bull: ForecastSummary }
  assumptions: {
    baseMonthlyGrowthRate: number
    baseChurnRate: number
    baseOpexGrowthRate: number
  }
  horizonMonths: number
}

export interface DashboardSummary {
  cashBalance: number
  cashBalanceTrend: number
  mrr: number
  mrrTrend: number
  arr: number
  runway: number
  burnRate: number
  grossMargin: number
  grossMarginTrend: number
  ebitda: number
  ebitdaTrend: number
}
