'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Header from '@/components/layout/Header'
import MetricCard from '@/components/ui/MetricCard'
import Card from '@/components/ui/Card'
import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/charts/ChartSkeleton'
// Lazy-loaded — these pull in recharts; keeping them out of the initial bundle.
const CashFlowChart = dynamic(() => import('@/components/charts/CashFlowChart'), { ssr: false, loading: () => <ChartSkeleton /> })
const NaviScore = dynamic(() => import('@/components/NaviScore'), { ssr: false, loading: () => <ChartSkeleton height={320} /> })
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'
import RefreshNowButton from '@/components/RefreshNowButton'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, TrendingUp, Activity, Clock, BarChart3, Users, PieChart, Wallet, Sparkles, ArrowRight } from 'lucide-react'
import type { CashFlowDataPoint } from '@/types'

interface Metrics {
  hasData: boolean
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: { totalIncome: number; totalExpenses: number; netIncome: number; netMargin: number | null }
  cashFlow: { burnRate: number; byMonth: { month: string; cashIn: number; cashOut: number; net: number }[] }
  cash: { balance: number | null }
  runwayMonths: number | null
}
interface StripeMetrics { mrr: number; arr: number; customers?: { total: number }; churnRate: number }

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

export default function DashboardPage() {
  const [m, setM] = useState<Metrics | null>(null)
  const [stripe, setStripe] = useState<StripeMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  // Computed after mount only — formatting a live date during render differs
  // between server and browser (ICU versions, ticking clock) and breaks hydration.
  const [lastUpdated, setLastUpdated] = useState('')
  useEffect(() => {
    setLastUpdated(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))
  }, [])

  useEffect(() => {
    let alive = true
    const loadData = () => {
      Promise.all([
        fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/stripe/metrics').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([metrics, sm]) => {
        if (!alive) return
        setM(metrics)
        if (sm?.source === 'stripe' && sm.metrics) setStripe(sm.metrics)
        setLoading(false)
      }).catch(() => { if (alive) setLoading(false) })
    }
    loadData()
    // If the page is restored from the back/forward cache (e.g. Back from Stripe
    // Checkout), effects don't re-run — re-fetch so it isn't left stale/stuck.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { setLoading(true); loadData() } }
    window.addEventListener('pageshow', onShow)
    return () => { alive = false; window.removeEventListener('pageshow', onShow) }
  }, [])

  const anyConnected = !!(m?.sources && (m.sources.plaid || m.sources.stripe || m.sources.quickbooks || m.sources.xero))
  const is = m?.incomeStatement
  const cf = m?.cashFlow
  const cash = m?.cash?.balance ?? null
  const runway = m?.runwayMonths ?? null

  // Build the cash-flow chart series with reconstructed ending balance.
  const series: CashFlowDataPoint[] = (() => {
    if (!cf?.byMonth?.length) return []
    const out: CashFlowDataPoint[] = cf.byMonth.map((b) => ({ month: monthLabel(b.month), cashIn: b.cashIn, cashOut: b.cashOut, netCashFlow: b.net, balance: 0 }))
    let running = cash ?? 0
    for (let i = out.length - 1; i >= 0; i--) { out[i].balance = Math.round(running); running -= out[i].netCashFlow }
    return out
  })()

  // Always render the full, fixed set of cards so the grid frame stays consistent
  // whether or not a given metric has data yet. Missing values show an em dash and
  // a hint telling the user what to connect — never a collapsed/missing frame.
  const EMPTY = '—'
  const plaid = !!m?.sources?.plaid
  const netPositive = (is?.netIncome ?? 0) >= 0
  const cards: { title: string; value: string; suffix?: string; subtitle?: string; icon: ReactNode; iconBg: string; tooltip: string }[] = [
    {
      title: 'Cash Balance',
      value: plaid && cash != null ? formatCurrency(cash, true) : EMPTY,
      subtitle: plaid && cash != null ? (runway == null ? 'Cash positive' : `${runway}mo runway`) : 'Connect a bank',
      icon: <DollarSign size={16} style={{ color: '#10B981' }} />, iconBg: 'rgba(16,185,129,0.15)',
      tooltip: 'Cash across your checking/savings accounts, synced via Plaid (credit/loan balances excluded).',
    },
    {
      title: 'MRR',
      value: stripe ? formatCurrency(stripe.mrr, true) : EMPTY,
      subtitle: stripe ? `ARR ${formatCurrency(stripe.arr, true)}` : 'Connect Stripe',
      icon: <TrendingUp size={16} style={{ color: '#3B82F6' }} />, iconBg: 'rgba(59,130,246,0.15)',
      tooltip: 'Monthly Recurring Revenue from active Stripe subscriptions.',
    },
    {
      title: 'Total Income',
      value: is ? formatCurrency(is.totalIncome, true) : EMPTY,
      subtitle: 'Year-to-date',
      icon: <Wallet size={16} style={{ color: '#3B82F6' }} />, iconBg: 'rgba(59,130,246,0.15)',
      tooltip: 'Year-to-date income from your payment + bank activity, deduplicated.',
    },
    {
      title: 'Net Income',
      value: is ? formatCurrency(is.netIncome, true) : EMPTY,
      subtitle: 'Year-to-date',
      icon: <BarChart3 size={16} style={{ color: netPositive ? '#10B981' : '#EF4444' }} />,
      iconBg: netPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
      tooltip: 'Income minus operating expenses, year-to-date.',
    },
    {
      title: 'Net Margin',
      value: is?.netMargin != null ? is.netMargin.toFixed(1) : EMPTY,
      suffix: is?.netMargin != null ? '%' : undefined,
      icon: <PieChart size={16} style={{ color: '#14B8A6' }} />, iconBg: 'rgba(20,184,166,0.15)',
      tooltip: 'Net income as a percentage of total income, year-to-date.',
    },
    {
      title: 'Monthly Burn',
      value: plaid ? (cf && cf.burnRate > 0 ? formatCurrency(cf.burnRate, true) : 'Cash positive') : EMPTY,
      subtitle: plaid ? undefined : 'Connect a bank',
      icon: <Clock size={16} style={{ color: '#F59E0B' }} />, iconBg: 'rgba(245,158,11,0.15)',
      tooltip: 'Average net cash consumed per month across cash-negative months.',
    },
    {
      title: 'Runway',
      value: plaid ? (runway == null ? '∞' : `${runway}`) : EMPTY,
      suffix: plaid && runway != null ? ' mo' : undefined,
      subtitle: plaid ? undefined : 'Connect a bank',
      icon: <Activity size={16} style={{ color: '#8B5CF6' }} />, iconBg: 'rgba(139,92,246,0.15)',
      tooltip: 'Months until cash runs out at current burn (Cash ÷ Burn).',
    },
    {
      title: 'Customers',
      value: stripe?.customers ? stripe.customers.total.toLocaleString() : EMPTY,
      subtitle: stripe?.customers ? `${(stripe.churnRate * 100).toFixed(1)}% churn` : 'Connect Stripe',
      icon: <Users size={16} style={{ color: '#3B82F6' }} />, iconBg: 'rgba(59,130,246,0.15)',
      tooltip: 'Active Stripe customers and monthly logo churn.',
    },
  ]

  return (
    <div>
      <Header title="Financial Overview" subtitle={lastUpdated ? `Last updated: ${lastUpdated}` : 'Last updated: —'} />

      {m?.sources?.plaid && (
        <div className="px-4 sm:px-6 pt-4">
          <RefreshNowButton />
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}
          </div>
        ) : !anyConnected || !m?.hasData ? (
          // First-run journey: connect → sync → first insight. Replaces the
          // static prompt AND covers the connected-but-still-syncing window.
          <OnboardingFlow
            connected={anyConnected}
            onReady={(fresh) => setM((prev) => ({ ...(prev as Metrics), ...(fresh as Metrics) }))}
          />
        ) : (
          <>
            {/* ── Mobile feed: hero balance + compact KPI chips + Navi prompt ── */}
            <div className="lg:hidden space-y-4">
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(150deg, var(--color-surface-card), var(--color-surface-bg))', border: '1px solid var(--color-surface-border)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{cards[0].title}</p>
                <p className="text-[2rem] leading-tight font-bold text-white mt-1">{cards[0].value}{cards[0].suffix ?? ''}</p>
                {cards[0].subtitle && <p className="text-xs mt-1.5" style={{ color: '#00C49F' }}>{cards[0].subtitle}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {cards.slice(1).map((c) => (
                  <div key={c.title} className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: c.iconBg }}>{c.icon}</span>
                      <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{c.title}</span>
                    </div>
                    <p className="text-lg font-semibold text-white mt-1.5">{c.value}{c.suffix ?? ''}</p>
                    {c.subtitle && <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{c.subtitle}</p>}
                  </div>
                ))}
              </div>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('naviio:open-navi'))}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
              >
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(0,196,159,0.15)' }}><Sparkles size={18} style={{ color: '#00C49F' }} /></span>
                <span className="flex-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Ask Navi about your finances</span>
                <ArrowRight size={16} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>

            {/* ── Desktop metric grid (unchanged) ── */}
            <div className="hidden lg:grid grid-cols-4 gap-4">
              {cards.map((c) => (
                <MetricCard key={c.title} title={c.title} value={c.value} suffix={c.suffix} subtitle={c.subtitle} icon={c.icon} iconBg={c.iconBg} tooltip={c.tooltip} />
              ))}
            </div>

            <NaviScore />

            {series.length > 0 && (
              <Card title="Cash Flow" subtitle="Monthly cash in, out, and ending balance" tooltip="Monthly cash in/out and reconstructed ending balance from your bank transactions.">
                <CashFlowChart data={series} />
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {is && (
                <Card title="P&L Snapshot" subtitle="Year-to-date · cash basis" tooltip="Year-to-date income statement (cash basis — revenue when received, expense when paid) from your deduplicated transaction ledger. Not a GAAP accrual statement.">
                  <div className="space-y-3">
                    {[
                      { label: 'Total Income', value: is.totalIncome, color: '#3B82F6' },
                      { label: 'Total Expenses', value: -is.totalExpenses, color: '#EF4444' },
                      { label: 'Net Income', value: is.netIncome, color: is.netIncome >= 0 ? '#10B981' : '#EF4444' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                        <span className="text-sm font-semibold" style={{ color }}>{value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}</span>
                      </div>
                    ))}
                    {is.netMargin != null && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Net Margin</span>
                        <span className="text-sm font-bold" style={{ color: '#14B8A6' }}>{is.netMargin.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {m?.sources?.plaid && cash != null && (
                <Card title="Cash Runway" subtitle="At current burn rate" tooltip="Months of cash remaining at the current burn rate. The gauge fills toward an 18-month buffer.">
                  <div className="flex flex-col items-center justify-center py-4 gap-4">
                    <div className="relative w-36 h-36">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-surface-border)" strokeWidth="10" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#3B82F6" strokeWidth="10" strokeDasharray={`${Math.min((runway ?? 18) / 18, 1) * 251.2} 251.2`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-white">{runway == null ? '∞' : runway}</span>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{runway == null ? 'cash positive' : 'months'}</span>
                      </div>
                    </div>
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-xs"><span style={{ color: 'var(--color-text-muted)' }}>Cash balance</span><span className="font-semibold text-white">{formatCurrency(cash, true)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: 'var(--color-text-muted)' }}>Monthly burn</span><span className="font-semibold" style={{ color: '#F59E0B' }}>{cf && cf.burnRate > 0 ? formatCurrency(cf.burnRate, true) : '—'}</span></div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
