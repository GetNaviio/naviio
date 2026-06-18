'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import NaviBadge from '@/components/ui/NaviBadge'
import MetricCard from '@/components/ui/MetricCard'
import MobileHero from '@/components/dashboard/MobileHero'
import { usePeriod } from '@/components/layout/PeriodContext'
import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/charts/ChartSkeleton'
// Lazy-loaded — pulls in recharts; kept out of the initial bundle.
const ExpenseChart = dynamic(() => import('@/components/charts/ExpenseChart'), { ssr: false, loading: () => <ChartSkeleton /> })
import Badge from '@/components/ui/Badge'
import ConnectPrompt from '@/components/ConnectPrompt'
import FreshnessLine, { type MonthlyMeta } from '@/components/model/FreshnessLine'
import AdInsightPopover from '@/components/ads/AdInsightPopover'
import ProvenanceDrawer, { type ProvenanceQuery } from '@/components/provenance/ProvenanceDrawer'
import { detectAdPlatform } from '@/lib/ads/match'
import { RECLASSIFY_OPTIONS } from '@/lib/metrics/classify'
import { usePersistentState } from '@/hooks/usePersistentState'
import { formatCurrency } from '@/lib/utils'
import { CreditCard, TrendingUp, Layers, X, ChevronDown, CalendarDays, Pencil, Sparkles } from 'lucide-react'
import type { ExpenseCategory, Transaction } from '@/types'

interface Metrics {
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: {
    totalExpenses: number
    expensesByCategory: { category: string; amount: number }[]
    byMonth: { month: string; expenses: number }[]
  }
}

interface MonthRow {
  month: string
  expenses: number
  expensesByCategory: { category: string; amount: number }[]
}

// Stable color palette assigned to categories by rank.
const PALETTE = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#A3A3A3']

const monthLabel = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
const monthLabelLong = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const lastYearYm = (ym: string) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`

export default function ExpensesPage() {
  const [m, setM] = useState<Metrics | null>(null)
  const [months24, setMonths24] = useState<MonthRow[]>([])
  const [meta, setMeta] = useState<MonthlyMeta | null>(null)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  // Shared month scope across P&L and Expenses — pick March on one tab,
  // the other follows. null = YTD (default). Survives navigation.
  const [sel, setSel] = usePersistentState<string | null>('dashboard:selectedMonth', null)
  const { period } = usePeriod()
  const tableRef = useRef<HTMLDivElement>(null)
  // Provenance drill-down: which figure's transactions are open (null = closed).
  const [prov, setProv] = useState<ProvenanceQuery | null>(null)
  // Fix-the-AI: which row's category editor is open, and a reload key that
  // refreshes EVERYTHING after a reclassification (cards, chart, list) so the
  // fix visibly moves the numbers everywhere at once.
  const [editing, setEditing] = useState<string | null>(null)
  // A chosen category awaiting the "all of this vendor vs. just this one" choice.
  const [pendingReclass, setPendingReclass] = useState<{ tx: Transaction; category: string } | null>(null)
  // Which row's COGS/OpEx tag editor is open (separate from the category editor).
  const [cogsEditing, setCogsEditing] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Review queue: show only low-confidence (uncategorized) expenses needing a look.
  const [reviewOnly, setReviewOnly] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/pl/monthly').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([metrics, monthly]) => {
        if (!alive) return
        setM(metrics)
        setMonths24(monthly?.months ?? [])
        setMeta(monthly?.meta ?? null)
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reloadKey])

  // Transactions follow the month scope — filtered server-side, so an older
  // month is complete rather than whatever survives the "recent 200" window.
  useEffect(() => {
    let alive = true
    setTxLoading(true)
    const url = sel ? `/api/transactions?limit=500&month=${sel}` : '/api/transactions?limit=200'
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((tx) => { if (alive) setTxns(tx?.transactions ?? []) })
      .catch(() => {})
      .finally(() => { if (alive) setTxLoading(false) })
    return () => { alive = false }
  }, [sel, reloadKey])

  const connected = !!(m?.sources?.plaid || m?.sources?.stripe)
  const byYm = useMemo(() => new Map(months24.map((r) => [r.month, r])), [months24])
  const currentYm = meta?.currentMonth ?? new Date().toISOString().slice(0, 7)
  // The header period drives the scope: This Month → current month; YTD → full year.
  useEffect(() => { setSel(period === 'month' ? currentYm : null) }, [period, currentYm, setSel])

  // ── Scope: which period the cards/chart/categories describe ───────────────
  const scope = useMemo(() => {
    if (sel && byYm.has(sel)) {
      const cur = byYm.get(sel)!
      const isPartial = sel === currentYm
      const ly = byYm.get(lastYearYm(sel)) ?? null
      return {
        kind: 'month' as const,
        label: `${monthLabelLong(sel)}${isPartial ? ' (MTD)' : ''}`,
        total: cur.expenses,
        categories: cur.expensesByCategory,
        isPartial,
        yoy: !isPartial && ly && ly.expenses !== 0 ? ((cur.expenses - ly.expenses) / Math.abs(ly.expenses)) * 100 : null,
        yoyLabel: ly ? `vs ${monthLabel(ly.month)}` : null,
      }
    }
    return {
      kind: 'ytd' as const,
      label: 'Year-to-date',
      total: m?.incomeStatement?.totalExpenses ?? 0,
      categories: m?.incomeStatement?.expensesByCategory ?? [],
      isPartial: false,
      yoy: null,
      yoyLabel: null,
    }
  }, [sel, byYm, currentYm, m])

  // Build colored, percentaged categories for the chart + legend.
  const expenseCategories: ExpenseCategory[] = useMemo(() => {
    const total = scope.categories.reduce((s, c) => s + c.amount, 0) || 1
    return scope.categories.map((c, i) => ({
      category: c.category,
      amount: c.amount,
      percentage: (c.amount / total) * 100,
      trend: 0,
      color: PALETTE[i % PALETTE.length],
    }))
  }, [scope.categories])

  // The Expenses tab shows EXPENSE rows only — revenue lives on the Revenue tab,
  // transfers on Cash Flow (keeps the label matching the contents; no double-count).
  const expenseTxns = useMemo(() => txns.filter((t) => t.editable), [txns])
  const allCategories = useMemo(
    () => Array.from(new Set(expenseTxns.map((t) => t.category).filter(Boolean))),
    [expenseTxns],
  )

  function handleCategoryClick(category: string) {
    const next = activeCategory === category ? null : category
    setActiveCategory(next)
    if (next) setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // Recurring + larger items first within the review queue so the costly,
  // committed outflows (payroll/rent/SaaS) surface at the top.
  const reviewCount = useMemo(() => expenseTxns.filter((t) => t.needsReview).length, [expenseTxns])
  const filteredTx = useMemo(() => {
    let list = activeCategory ? expenseTxns.filter((t) => t.category === activeCategory) : expenseTxns
    if (reviewOnly) {
      list = list
        .filter((t) => t.needsReview)
        .slice()
        .sort((a, b) => Number(b.recurring) - Number(a.recurring) || Math.abs(b.amount) - Math.abs(a.amount))
    }
    return list
  }, [expenseTxns, activeCategory, reviewOnly])

  // Reclassify (or reset) a transaction's category — the fix-the-AI write path.
  // applyToVendor=true re-categorizes every transaction from this vendor (the
  // default); false pins just this one (wins over the vendor default).
  async function reclassify(tx: Transaction, category: string | null, applyToVendor = true) {
    setEditing(null)
    setPendingReclass(null)
    if (!tx.externalId) return
    try {
      const res = category === null
        ? await fetch(`/api/transactions/classify?externalId=${encodeURIComponent(tx.externalId)}`, { method: 'DELETE' })
        : await fetch('/api/transactions/classify', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ externalId: tx.externalId, category, applyToVendor }),
          })
      if (res.ok) setReloadKey((k) => k + 1) // one fix → every view updates
    } catch { /* row keeps its old label; user can retry */ }
  }

  // Tag a transaction as COGS or operating expense (or reset to auto). Same
  // write path as reclassify — PATCH expenseClass — so the gross-margin split in
  // the P&L and Financial Model moves with one fix. null = back to the heuristic.
  async function setCogs(tx: Transaction, expenseClass: 'COGS' | 'OPEX' | null) {
    setCogsEditing(null)
    if (!tx.externalId) return
    try {
      const res = await fetch('/api/transactions/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalId: tx.externalId, expenseClass }),
      })
      if (res.ok) setReloadKey((k) => k + 1)
    } catch { /* row keeps its old tag; user can retry */ }
  }
  const largest = expenseCategories[0]
  const monthsDesc = useMemo(() => [...months24].reverse(), [months24])

  return (
    <div>
      <Header title="Expenses" subtitle="Auto-categorized transactions from your live bank & payment activity" showPeriod />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />
            ))}
          </div>
        ) : !connected ? (
          <ConnectPrompt
            icon={<CreditCard size={20} />}
            title="Connect a data source to see expenses"
            message="Expenses are auto-categorized from your live bank (Plaid) and payment (Stripe) transactions. Connect one to get started."
            cta="Connect an integration"
          />
        ) : (
          <>
            {/* Scope row — same pattern as the P&L tab */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 rounded-md flex items-center gap-1.5" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.35)' }}>
                <CalendarDays size={11} />
                {scope.label}
                {sel && (
                  <button onClick={() => setSel(null)} aria-label="Back to year-to-date" className="ml-0.5 rounded-full hover:opacity-70 transition-opacity">
                    <X size={11} />
                  </button>
                )}
              </span>
              {monthsDesc.length > 0 && (
                <div className="relative">
                  <select
                    value={sel ?? ''}
                    onChange={(e) => setSel(e.target.value || null)}
                    aria-label="Filter expenses by month"
                    className="appearance-none pl-2.5 pr-6 py-1 rounded-md text-xs font-medium outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}
                  >
                    <option value="">Year-to-date</option>
                    {monthsDesc.map((r) => (
                      <option key={r.month} value={r.month}>
                        {monthLabel(r.month)}{r.month === currentYm ? ' (MTD)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}
            </div>

            {meta && <FreshnessLine meta={meta} />}

            {/* Mobile: hero (Total Expenses) + top-3 category chips. Desktop keeps the 3-card grid. */}
            <MobileHero
              label={`Total Expenses · ${scope.label}`}
              value={formatCurrency(scope.total, true)}
              sub={largest ? `Largest: ${largest.category} (${largest.percentage.toFixed(0)}%) · ${scope.categories.length} categories` : `${scope.categories.length} categories`}
              chips={expenseCategories.slice(0, 3).map((c) => ({
                label: c.category,
                value: formatCurrency(c.amount, true),
                color: c.color,
              }))}
            />

            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard
                title="Total Expenses"
                value={formatCurrency(scope.total, true)}
                trend={scope.yoy ?? undefined}
                trendLabel={scope.yoyLabel ?? 'vs last year'}
                goodWhen="down"
                icon={<CreditCard size={16} style={{ color: '#F59E0B' }} />}
                iconBg="rgba(245,158,11,0.15)"
                subtitle={scope.label}
                tooltip={`Total operating expenses for ${scope.label.toLowerCase()} — categorized bank/payment outflows, with transfers and loan principal excluded. Green when spend is LOWER than the same month last year. No comparison is shown for the in-progress month.`}
              />
              <MetricCard title="Largest Category" value={largest?.category ?? '—'} suffix={largest ? ` ${largest.percentage.toFixed(0)}%` : ''} icon={<TrendingUp size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" subtitle={scope.label} tooltip="Your single biggest expense category in the selected period and its share of total operating expenses." />
              <MetricCard title="Categories Tracked" value={`${scope.categories.length}`} icon={<Layers size={16} style={{ color: '#10B981' }} />} iconBg="rgba(16,185,129,0.15)" subtitle={scope.label} tooltip="Number of distinct expense categories detected in the selected period." />
            </div>

            {scope.isPartial && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {monthLabelLong(sel!)} is still in progress — figures are month-to-date and aren&apos;t compared against prior periods until the month closes.
              </p>
            )}

            {expenseCategories.length === 0 ? (
              <Card title="Expense Breakdown">
                <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No expense transactions {scope.kind === 'month' ? `in ${scope.label}` : 'yet'} — {scope.kind === 'month' ? 'pick another month or return to year-to-date.' : 'they’ll appear here as your accounts sync.'}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Expense Breakdown" badge={<NaviBadge />} subtitle={`${scope.label} — by category`} tooltip="Categorized automatically by Navi. Operating expenses by category for the selected period. Concentration here shows your primary cost levers.">
                  <ExpenseChart data={expenseCategories} />
                  <div className="mt-4 space-y-2">
                    {expenseCategories.map((cat) => (
                      <div key={cat.category} className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>{cat.category}</span>
                        <button
                          onClick={() => setProv({ label: `${scope.label} · ${cat.category}`, figure: cat.amount, scope: scope.kind === 'month' ? 'month' : 'ytd', month: sel ?? undefined, bucket: 'expenses', category: cat.category })}
                          className="text-xs font-medium text-white hover:underline decoration-dotted underline-offset-2"
                          title="See the transactions behind this figure"
                        >
                          {formatCurrency(cat.amount, true)}
                        </button>
                        <span className="text-xs w-10 text-right" style={{ color: 'var(--color-text-muted)' }}>{cat.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="Categories" subtitle="Click a category to filter transactions below" tooltip="Operating expense categories by spend in the selected period. Click any row to drill into its transactions.">
                  <div className="space-y-2">
                    {expenseCategories.map((cat) => {
                      const isActive = activeCategory === cat.category
                      return (
                        <button
                          key={cat.category}
                          onClick={() => handleCategoryClick(cat.category)}
                          className="w-full text-left rounded-lg px-3 py-2.5 transition-all"
                          style={{ backgroundColor: isActive ? `${cat.color}18` : 'transparent', border: `1px solid ${isActive ? cat.color + '60' : 'transparent'}` }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{cat.category}</span>
                            </div>
                            <span className="text-sm font-semibold text-white">{formatCurrency(cat.amount, true)}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color, opacity: isActive ? 1 : 0.6 }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {activeCategory && (
                    <button onClick={() => setActiveCategory(null)} className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ backgroundColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                      <X size={11} /> Clear filter
                    </button>
                  )}
                </Card>
              </div>
            )}

            <div ref={tableRef}>
              <Card
                title="Expense Transactions"
                subtitle={
                  txLoading
                    ? 'Loading…'
                    : `${filteredTx.length}${activeCategory ? ` in "${activeCategory}"` : ''} · ${scope.kind === 'month' ? scope.label : `${expenseTxns.length} most recent`} · revenue is on the Revenue tab`
                }
                padding={false}
                action={
                  <div className="flex items-center gap-1.5">
                    {reviewCount > 0 && (
                      <button
                        onClick={() => setReviewOnly((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={reviewOnly
                          ? { backgroundColor: '#F59E0B', color: '#1A1A1A' }
                          : { backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
                        title="Uncategorized expenses Navi isn't confident about"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: reviewOnly ? '#1A1A1A' : '#F59E0B' }} />
                        {reviewOnly ? 'Showing review' : `Needs review · ${reviewCount}`}
                      </button>
                    )}
                    {activeCategory && (
                      <button onClick={() => setActiveCategory(null)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
                        <X size={11} /> Clear
                      </button>
                    )}
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Date</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Description</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                          <div className="flex items-center gap-1.5">
                            <span>Category</span>
                            <div className="relative">
                              <select
                                value={activeCategory ?? ''}
                                onChange={(e) => setActiveCategory(e.target.value || null)}
                                className="appearance-none pl-1.5 pr-5 py-0.5 rounded text-xs outline-none cursor-pointer"
                                style={{ backgroundColor: activeCategory ? 'rgba(59,130,246,0.2)' : 'var(--color-surface-border)', color: activeCategory ? '#3B82F6' : 'var(--color-text-muted)', border: `1px solid ${activeCategory ? '#3B82F6' : 'var(--color-surface-border)'}` }}
                              >
                                <option value="">All</option>
                                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }} title="Cost of revenue vs operating expense — drives the gross-margin split in your P&L and Financial Model">COGS / OpEx</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Source</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTx.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>{txLoading ? 'Loading transactions…' : `No transactions${activeCategory ? ` in "${activeCategory}"` : ''}${scope.kind === 'month' ? ` for ${scope.label}` : ' yet'}.`}</td></tr>
                      ) : (
                        filteredTx.map((tx, i) => (
                          <tr key={tx.id} className="group" style={{ borderBottom: '1px solid var(--color-surface-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-surface-bg)' }}>
                            <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: scope.kind === 'month' ? undefined : 'numeric' })}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-white flex items-center gap-2">
                                {tx.description}
                                {(() => {
                                  const platform = detectAdPlatform(tx.description, tx.merchantName)
                                  return platform ? <AdInsightPopover txnId={tx.id} platform={platform} /> : null
                                })()}
                              </p>
                              {tx.merchantName && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{tx.merchantName}</p>}
                            </td>
                            <td className="px-4 py-3">
                              {pendingReclass?.tx.id === tx.id ? (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                    Set to <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{pendingReclass.category}</span> for:
                                  </span>
                                  <div className="flex gap-1.5">
                                    <button onClick={() => reclassify(tx, pendingReclass.category, true)} className="px-2 py-1 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6', border: '1px solid #3B82F6' }}>
                                      All “{(tx.merchantName || tx.description || 'vendor').slice(0, 20)}”
                                    </button>
                                    <button onClick={() => reclassify(tx, pendingReclass.category, false)} className="px-2 py-1 rounded text-[11px]" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
                                      Just this one
                                    </button>
                                  </div>
                                  <button onClick={() => setPendingReclass(null)} className="text-[10px] text-left" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                                </div>
                              ) : editing === tx.id ? (
                                <select
                                  autoFocus
                                  defaultValue={tx.category}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === '__auto__') reclassify(tx, null)
                                    else { setPendingReclass({ tx, category: v }); setEditing(null) }
                                  }}
                                  onBlur={() => setEditing(null)}
                                  className="px-1.5 py-1 rounded text-xs outline-none cursor-pointer"
                                  style={{ backgroundColor: 'var(--color-surface-input)', color: 'var(--color-text-primary)', border: '1px solid #3B82F6' }}
                                  aria-label="Reclassify transaction"
                                >
                                  {RECLASSIFY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                  {tx.overridden && <option value="__auto__">↺ Reset to auto</option>}
                                </select>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <button onClick={() => handleCategoryClick(tx.category)} className="transition-opacity hover:opacity-80">
                                    <Badge variant={tx.category === 'Revenue' ? 'success' : tx.category === 'Transfer' ? 'info' : 'neutral'} size="sm">{tx.category}</Badge>
                                  </button>
                                  {tx.overridden && <Sparkles size={10} style={{ color: '#14B8A6' }} aria-label="Reclassified by you" />}
                                  {!tx.overridden && tx.needsReview && (
                                    <button
                                      onClick={() => setEditing(tx.id)}
                                      className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
                                      title={tx.recurring ? 'Recurring charge Navi could not categorize — please confirm' : "Navi isn't sure of this category — please confirm"}
                                    >
                                      {tx.recurring ? 'Review · recurring' : 'Review'}
                                    </button>
                                  )}
                                  {tx.editable && (
                                    <button
                                      onClick={() => setEditing(tx.id)}
                                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                                      style={{ color: 'var(--color-text-muted)' }}
                                      aria-label={`Reclassify ${tx.description}`}
                                      title="Fix the category"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!tx.editable || !tx.expenseClass ? (
                                <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                              ) : cogsEditing === tx.id ? (
                                <select
                                  autoFocus
                                  defaultValue={tx.cogsOverridden ? tx.expenseClass : '__auto__'}
                                  onChange={(e) => setCogs(tx, e.target.value === '__auto__' ? null : (e.target.value as 'COGS' | 'OPEX'))}
                                  onBlur={() => setCogsEditing(null)}
                                  className="px-1.5 py-1 rounded text-xs outline-none cursor-pointer"
                                  style={{ backgroundColor: 'var(--color-surface-input)', color: 'var(--color-text-primary)', border: '1px solid #3B82F6' }}
                                  aria-label="Tag as COGS or operating expense"
                                >
                                  <option value="COGS">COGS</option>
                                  <option value="OPEX">OpEx</option>
                                  {tx.cogsOverridden && <option value="__auto__">↺ Reset to auto</option>}
                                </select>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <Badge variant={tx.expenseClass === 'COGS' ? 'warning' : 'neutral'} size="sm">
                                    {tx.expenseClass === 'COGS' ? 'COGS' : 'OpEx'}
                                  </Badge>
                                  {tx.cogsOverridden && <Sparkles size={10} style={{ color: '#14B8A6' }} aria-label="Tagged by you" />}
                                  <button
                                    onClick={() => setCogsEditing(tx.id)}
                                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                                    style={{ color: 'var(--color-text-muted)' }}
                                    aria-label={`Tag ${tx.description} as COGS or operating expense`}
                                    title="Tag as COGS or OpEx"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3"><Badge variant="info" size="sm">{tx.source}</Badge></td>
                            <td className="px-4 py-3 font-semibold" style={{ color: tx.type === 'credit' ? '#10B981' : 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                              {tx.type === 'credit' ? '+' : '−'}{formatCurrency(tx.amount, true)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {prov && <ProvenanceDrawer query={prov} onClose={() => setProv(null)} />}
    </div>
  )
}
