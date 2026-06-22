'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import MobileHero from '@/components/dashboard/MobileHero'
import LedgerList from '@/components/transactions/LedgerList'
import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/charts/ChartSkeleton'
// Lazy-loaded — pulls in recharts; kept out of the initial bundle.
const CashFlowChart = dynamic(() => import('@/components/charts/CashFlowChart'), { ssr: false, loading: () => <ChartSkeleton /> })
import ConnectPrompt from '@/components/ConnectPrompt'
import InfoTip from '@/components/ui/InfoTip'
import { formatCurrency, calcRunway } from '@/lib/utils'
import { DollarSign, TrendingDown, TrendingUp, Clock, Activity, Banknote } from 'lucide-react'
import type { CashFlowDataPoint } from '@/types'

interface Metrics {
  hasData: boolean
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: { expensesByCategory: { category: string; amount: number }[] }
  cashFlow: {
    cashIn: number
    cashOut: number
    netCashFlow: number
    burnRate: number
    byMonth: { month: string; cashIn: number; cashOut: number; net: number }[]
  }
  cash: { balance: number | null }
  runwayMonths: number | null
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

export default function CashFlowPage() {
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setM(d); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const connected = !!m?.sources?.plaid
  const cf = m?.cashFlow
  const cash = m?.cash?.balance ?? null

  // Build the chart series with a back-computed ending balance per month.
  const series: CashFlowDataPoint[] = (() => {
    if (!cf?.byMonth?.length) return []
    const out: CashFlowDataPoint[] = cf.byMonth.map((b) => ({
      month: monthLabel(b.month), cashIn: b.cashIn, cashOut: b.cashOut, netCashFlow: b.net, balance: 0,
    }))
    // End balance of the last month = current cash; walk backwards.
    let running = cash ?? 0
    for (let i = out.length - 1; i >= 0; i--) {
      out[i].balance = Math.round(running)
      running -= out[i].netCashFlow
    }
    return out
  })()

  const thisMonthNet = cf?.byMonth?.length ? cf.byMonth[cf.byMonth.length - 1].net : 0
  const runway = m?.runwayMonths ?? null
  // Month-over-month change in ending cash balance (for the hero arrow).
  const cashTrend = series.length >= 2 && series[series.length - 2].balance
    ? ((series[series.length - 1].balance - series[series.length - 2].balance) / Math.abs(series[series.length - 2].balance)) * 100
    : null

  return (
    <div>
      <Header title="Cash Flow" subtitle="Live cash position, burn rate, and runway from your bank activity" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />
            ))}
          </div>
        ) : !connected ? (
          <ConnectPrompt
            icon={<Banknote size={20} />}
            title="Connect your bank to see cash flow"
            message="Cash balance, burn rate, and runway are calculated from your live bank transactions. Connect a bank account through Plaid to get started."
            cta="Connect a bank (Plaid)"
          />
        ) : (
          <>
            {/* Mobile: hero (Cash Balance) + 3 chips. Desktop keeps the 4-card grid. */}
            <MobileHero
              label="Cash Balance"
              value={cash != null ? formatCurrency(cash, true) : '—'}
              trend={cashTrend}
              sub={`${runway == null ? '∞' : `${runway} mo`} runway · ${cf && cf.burnRate > 0 ? `${formatCurrency(cf.burnRate, true)}/mo burn` : 'cash positive'}`}
              chips={[
                { label: 'Burn', value: cf && cf.burnRate > 0 ? formatCurrency(cf.burnRate, true) : 'positive', color: '#F59E0B' },
                { label: 'Net (mo)', value: formatCurrency(thisMonthNet, true), color: thisMonthNet >= 0 ? '#10B981' : '#F87171' },
                { label: 'Runway', value: cash == null ? '—' : runway == null ? '∞' : `${runway} mo`, color: '#8B5CF6' },
              ]}
            />

            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Cash-flow statement (these reconcile: Cash In − Cash Out = Net Cash Flow) */}
              <MetricCard
                title="Cash collected"
                value={cf ? formatCurrency(cf.cashIn, true) : '—'}
                icon={<TrendingUp size={16} style={{ color: '#10B981' }} />}
                iconBg="rgba(16,185,129,0.15)"
                subtitle="Trailing 12 mo"
                tooltip="Cash that actually landed in your connected accounts (deduplicated against Stripe payouts). This is a cash-timing view and is NOT the same as Revenue — revenue is recognized when a sale is charged, before the payout settles and net of fees. See the P&L for recognized revenue."
              />
              <MetricCard
                title="Cash Out"
                value={cf ? formatCurrency(cf.cashOut, true) : '—'}
                icon={<TrendingDown size={16} style={{ color: '#EF4444' }} />}
                iconBg="rgba(239,68,68,0.15)"
                subtitle="Trailing 12 mo"
                tooltip="Total cash paid out over the trailing 12 months. Internal transfers and loan principal are excluded."
              />
              <MetricCard
                title="Net Cash Flow"
                value={cf ? formatCurrency(cf.netCashFlow, true) : '—'}
                icon={<Activity size={16} style={{ color: cf && cf.netCashFlow >= 0 ? '#10B981' : '#EF4444' }} />}
                iconBg="rgba(59,130,246,0.15)"
                subtitle="Trailing 12 mo · In − Out"
                tooltip="Cash received minus cash paid out over the trailing 12 months. Positive means your cash position grew."
              />
              {/* Position & runway */}
              <MetricCard
                title="Cash Balance"
                value={cash != null ? formatCurrency(cash, true) : '—'}
                icon={<DollarSign size={16} style={{ color: '#10B981' }} />}
                iconBg="rgba(16,185,129,0.15)"
                subtitle="Depository accounts"
                tooltip="Total available cash across your connected checking/savings accounts (credit-card and loan balances excluded), synced via Plaid."
              />
              <MetricCard
                title="Net Burn"
                value={cf && cf.burnRate > 0 ? formatCurrency(cf.burnRate, true) : 'Cash positive'}
                icon={<TrendingDown size={16} style={{ color: '#F59E0B' }} />}
                iconBg="rgba(245,158,11,0.15)"
                subtitle="Avg monthly net outflow"
                tooltip="Average net cash consumed per month across months where you spent more than you brought in. 'Cash positive' means inflows exceeded outflows."
              />
              <MetricCard
                title="Runway"
                value={cash == null ? '—' : runway == null ? '∞' : `${runway}`}
                suffix={cash == null || runway == null ? '' : ' months'}
                icon={<Clock size={16} style={{ color: '#8B5CF6' }} />}
                iconBg="rgba(139,92,246,0.15)"
                subtitle={cash == null ? 'Cash balance unavailable' : runway == null ? 'Not burning cash' : 'At current net burn'}
                tooltip="Months until cash runs out at the current burn rate (Cash ÷ Net Burn). Infinite when you're cash-positive."
              />
            </div>

            <Card title="Cash Flow Trend" subtitle="Monthly cash in, out, and ending balance" tooltip="Monthly cash in, cash out, and ending balance derived from your bank transactions. Ending balance is reconstructed from your current balance and each month's net flow.">
              {series.length ? <CashFlowChart data={series} /> : <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No transactions yet — they’ll appear here as your bank syncs.</p>}
            </Card>

            {!!m?.incomeStatement?.expensesByCategory?.length && (
              <Card title="Operating Outflows by Category" subtitle="Year-to-date, from categorized bank transactions" tooltip="Your operating cash outflows grouped by category, auto-classified from bank transaction data. Internal transfers and loan principal are excluded.">
                <div className="space-y-3">
                  {(() => {
                    const cats = m.incomeStatement.expensesByCategory
                    const total = cats.reduce((s, c) => s + c.amount, 0) || 1
                    return cats.map(({ category, amount }) => {
                      const pct = (amount / total) * 100
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{category}</span>
                            <span className="text-sm font-semibold" style={{ color: '#EF4444' }}>{formatCurrency(amount, true)}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#EF4444', opacity: 0.7 }} />
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{pct.toFixed(1)}% of outflows</p>
                        </div>
                      )
                    })
                  })()}
                </div>
              </Card>
            )}

            {cash != null && cf && cf.burnRate > 0 && (
              <Card title="Runway Scenarios" subtitle="Months of cash under different burn rates" tooltip="Models months of runway under three burn assumptions, anchored to your real current cash and burn rate.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Bear Case', burn: Math.round(cf.burnRate * 1.2), color: '#EF4444', tag: 'High burn' },
                    { label: 'Base Case', burn: Math.round(cf.burnRate), color: '#3B82F6', tag: 'Current' },
                    { label: 'Bull Case', burn: Math.round(cf.burnRate * 0.8), color: '#10B981', tag: 'Optimized' },
                  ].map(({ label, burn, color, tag }) => (
                    <div key={label} className="rounded-lg p-4" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: `1px solid ${color}33` }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-white">{label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}20`, color }}>{tag}</span>
                      </div>
                      <p className="text-3xl font-bold" style={{ color }}>{calcRunway(cash, burn).toFixed(1)}mo</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Burn: {formatCurrency(burn, true)}/mo</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Transfers ledger — account-to-account movement lives here, off the P&L. */}
            <LedgerList
              title="Transfers"
              subtitle="Account-to-account movement and Stripe payouts — excluded from your P&L"
              category="Transfer"
              tooltip="Internal transfers, loan principal, and Stripe payouts. These move cash but are not income or expense, so they're excluded from the P&L. If one is actually an operating expense, reclassify it here and it'll move into your P&L."
              emptyText="No transfers detected."
              reclassifiable
            />

            <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <InfoTip text="All figures are computed from your live bank transactions, deduplicated against Stripe payouts." />
              Live from your connected bank{m?.sources?.stripe ? ' + Stripe' : ''}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
