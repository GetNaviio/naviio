'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Header from '@/components/layout/Header'
import NotificationsBell from '@/components/layout/NotificationsBell'
import CommandPalette from '@/components/layout/CommandPalette'
import { useTheme } from '@/components/layout/ThemeContext'
import { usePeriod } from '@/components/layout/PeriodContext'
import HeaderControls from '@/components/layout/HeaderControls'
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
import { DollarSign, TrendingUp, TrendingDown, Clock, Sparkles, ArrowRight, Search, Moon, Sun } from 'lucide-react'
import type { CashFlowDataPoint } from '@/types'

interface Metrics {
  hasData: boolean
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: { totalIncome: number; totalExpenses: number; netIncome: number; netMargin: number | null; byMonth: { month: string; income: number; expenses: number; net: number }[] }
  cashFlow: { burnRate: number; byMonth: { month: string; cashIn: number; cashOut: number; net: number }[] }
  cash: { balance: number | null }
  runwayMonths: number | null
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

export default function DashboardPage() {
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  // Computed after mount only — formatting a live date during render differs
  // between server and browser (ICU versions, ticking clock) and breaks hydration.
  const [lastUpdated, setLastUpdated] = useState('')
  const { theme, toggleTheme } = useTheme()
  const { period } = usePeriod()
  const [firstName, setFirstName] = useState('')
  const [greeting, setGreeting] = useState('Welcome')
  const [searchOpen, setSearchOpen] = useState(false)

  // Date/greeting/identity are resolved after mount (formatting a live date during
  // render breaks hydration; user/org come from the API).
  useEffect(() => {
    setLastUpdated(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const n = (d?.user?.name || d?.user?.email || '').toString().trim()
      if (n) setFirstName(n.split(/[\s@]+/)[0])
    }).catch(() => {})
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v) } }
    const onOpenSearch = () => setSearchOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('naviio:open-search', onOpenSearch)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('naviio:open-search', onOpenSearch) }
  }, [])

  useEffect(() => {
    let alive = true
    const loadData = () => {
      fetch('/api/metrics')
        .then((r) => (r.ok ? r.json() : null))
        .then((metrics) => {
          if (!alive) return
          setM(metrics)
          setLoading(false)
        })
        .catch(() => { if (alive) setLoading(false) })
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
  // Desktop cards (Cash Balance · Net Burn · Revenue · Runway) are computed below,
  // after the period-aware monthly-series helpers. The mobile hero + chips are
  // then derived from those same cards so the two layouts never drift apart.

  // Cash-balance month-over-month trend — drives the mobile hero arrow.
  const cashTrend = (() => {
    if (series.length < 2) return null
    const cur = series[series.length - 1].balance
    const prev = series[series.length - 2].balance
    if (!prev) return null
    return ((cur - prev) / Math.abs(prev)) * 100
  })()

  // ── Desktop (mockup layout): period-aware monthly series + the four cards ──
  const months = cf?.byMonth ?? []
  const lastM = months[months.length - 1]
  const prevM = months[months.length - 2]
  const pctChange = (cur?: number, prior?: number) =>
    cur != null && prior != null && prior !== 0 ? ((cur - prior) / Math.abs(prior)) * 100 : undefined
  const balSpark = series.map((s) => s.balance)
  // Revenue = RECOGNIZED revenue from the income statement (gross, on payment
  // date), so the Overview ties out to the P&L. NOT cash-in (bank-settlement
  // timing) — a Stripe charge is revenue when captured, even before its payout
  // lands in the bank. The cash-settlement view lives on Cash Flow ("Cash in").
  const isMonths = is?.byMonth ?? []
  const lastIsM = isMonths[isMonths.length - 1]
  const prevIsM = isMonths[isMonths.length - 2]
  const revSpark = isMonths.map((b) => b.income)
  const burnSpark = series.map((s) => Math.max(0, s.cashOut - s.cashIn))
  const burnNow = cf?.burnRate ?? 0
  const runwaySpark = burnNow > 0 ? balSpark.map((b) => Math.max(0, Math.round(b / burnNow))) : []
  const lastBurn = lastM ? Math.max(0, lastM.cashOut - lastM.cashIn) : undefined
  const prevBurn = prevM ? Math.max(0, prevM.cashOut - prevM.cashIn) : undefined
  const isMonth = period === 'month'
  const desktopCards: { title: string; value: string; suffix?: string; subtitle?: string; trend?: number; goodWhen?: 'up' | 'down'; icon: ReactNode; iconBg: string; sparkline?: number[]; sparklineColor: string; tooltip: string }[] = [
    {
      title: 'Cash Balance',
      value: plaid && cash != null ? formatCurrency(cash, true) : EMPTY,
      subtitle: plaid && cash != null ? 'Across connected accounts' : 'Connect a bank',
      trend: plaid ? (cashTrend ?? undefined) : undefined,
      icon: <DollarSign size={16} style={{ color: '#10B981' }} />, iconBg: 'rgba(16,185,129,0.15)',
      sparkline: plaid && balSpark.length > 1 ? balSpark : undefined, sparklineColor: '#10B981',
      tooltip: 'Total cash across connected checking/savings accounts (Plaid).',
    },
    {
      title: 'Net Burn',
      value: plaid
        ? (isMonth ? (lastBurn != null ? formatCurrency(lastBurn, true) : EMPTY) : (burnNow > 0 ? formatCurrency(burnNow, true) : 'Cash positive'))
        : EMPTY,
      subtitle: plaid ? (isMonth ? 'This month' : 'Avg / mo · YTD') : 'Connect a bank',
      trend: plaid ? pctChange(lastBurn, prevBurn) : undefined,
      goodWhen: 'down',
      icon: <TrendingDown size={16} style={{ color: '#8B5CF6' }} />, iconBg: 'rgba(139,92,246,0.15)',
      sparkline: plaid && burnSpark.length > 1 ? burnSpark : undefined, sparklineColor: '#8B5CF6',
      tooltip: 'Net cash consumed (outflows over inflows).',
    },
    {
      title: 'Revenue',
      value: isMonth ? (lastIsM ? formatCurrency(lastIsM.income, true) : EMPTY) : (is ? formatCurrency(is.totalIncome, true) : EMPTY),
      subtitle: isMonth ? 'This month' : 'Year to date',
      trend: pctChange(lastIsM?.income, prevIsM?.income),
      icon: <TrendingUp size={16} style={{ color: '#06B6D4' }} />, iconBg: 'rgba(6,182,212,0.15)',
      sparkline: revSpark.length > 1 ? revSpark : undefined, sparklineColor: '#06B6D4',
      tooltip: 'Recognized revenue — gross, on the payment date (a Stripe charge counts when captured, before its bank payout). Matches the P&L. Cash that actually landed in the bank is on Cash Flow ("Cash in").',
    },
    {
      title: 'Runway',
      value: plaid ? (runway == null ? '∞' : `${runway}`) : EMPTY,
      suffix: plaid && runway != null ? ' months' : undefined,
      subtitle: plaid ? 'At current burn' : 'Connect a bank',
      trend: plaid && runwaySpark.length > 1 ? pctChange(runwaySpark[runwaySpark.length - 1], runwaySpark[runwaySpark.length - 2]) : undefined,
      icon: <Clock size={16} style={{ color: '#3B82F6' }} />, iconBg: 'rgba(59,130,246,0.15)',
      sparkline: plaid && runwaySpark.length > 1 ? runwaySpark : undefined, sparklineColor: '#3B82F6',
      tooltip: 'Months of cash remaining at the current burn rate.',
    },
  ]

  // ── Mobile: the SAME four metrics as the desktop grid, in the hero + chips
  // framing — hero = first card (Cash Balance), chips = Net Burn · Revenue ·
  // Runway. Derived from desktopCards so mobile and desktop can't drift.
  type Chip = { label: string; value: string; color?: string }
  const heroCard = desktopCards[0]
  const heroLabel = heroCard.title
  const heroValue = `${heroCard.value}${heroCard.suffix ?? ''}`
  const heroSub = heroCard.subtitle ?? null
  const chips: Chip[] = desktopCards.slice(1).map((c) => ({
    label: c.title,
    // Compact the suffix for the narrow chips (e.g. " months" → " mo"); the
    // desktop cards keep the full word.
    value: `${c.value}${(c.suffix ?? '').replace(/\s*months?/i, ' mo')}`,
  }))

  return (
    <div>
      {/* Mobile keeps the standard header (brand icon + bell + title below) */}
      <div className="lg:hidden">
        <Header title="Financial Overview" subtitle={lastUpdated ? `Last updated: ${lastUpdated}` : 'Last updated: —'} />
      </div>

      {/* Desktop: personalized greeting + org / period / profile cluster */}
      <header
        className="hidden lg:flex items-center justify-between sticky top-0 z-30 px-6 py-4 border-b"
        style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>Here&apos;s your financial overview</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setSearchOpen(true)} className="p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }} aria-label="Search">
            <Search size={16} />
          </button>
          <button onClick={toggleTheme} className="p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }} aria-label="Toggle theme">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <NotificationsBell />
          <HeaderControls showPeriod />
        </div>
        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </header>

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
            {/* ── Mobile feed: hero (Runway) + 3 prioritized chips + Navi prompt ── */}
            <div className="lg:hidden space-y-4">
              <div className="rounded-2xl p-5" style={{ background: 'var(--hero-grad)', border: '1px solid var(--color-surface-border)' }}>
                <p className="text-xs" style={{ color: 'var(--hero-fg-muted)' }}>{heroLabel}</p>
                <div className="flex items-end gap-2 mt-1">
                  <p className="text-[2.25rem] leading-none font-bold" style={{ color: 'var(--hero-fg)' }}>{heroValue}</p>
                  {plaid && cashTrend != null && (
                    <span className="text-xs mb-1 flex items-center gap-0.5" style={{ color: cashTrend >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {cashTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(cashTrend).toFixed(0)}%
                    </span>
                  )}
                </div>
                {heroSub && <p className="text-xs mt-2" style={{ color: 'var(--hero-fg-sub)' }}>{heroSub}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {chips.map((c) => (
                  <div key={c.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
                    <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--color-text-muted)' }}>{c.label}</p>
                    <p className="text-base font-semibold mt-1 truncate" style={{ color: c.color ?? 'var(--color-text-primary)' }}>{c.value}</p>
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

            {/* ── Desktop metric grid: Cash Balance · Net Burn · Revenue · Runway ── */}
            <div className="hidden lg:grid grid-cols-4 gap-4">
              {desktopCards.map((c) => (
                <MetricCard
                  key={c.title}
                  title={c.title}
                  value={c.value}
                  suffix={c.suffix}
                  subtitle={c.subtitle}
                  trend={c.trend}
                  goodWhen={c.goodWhen}
                  icon={c.icon}
                  iconBg={c.iconBg}
                  tooltip={c.tooltip}
                  sparkline={c.sparkline}
                  sparklineColor={c.sparklineColor}
                />
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
