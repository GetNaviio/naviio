'use client'

import { useCallback, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import ConnectPrompt from '@/components/ConnectPrompt'
import { SkeletonGrid, ErrorState } from '@/components/ui/PageState'
import { usePageData, fetchJson } from '@/hooks/usePageData'
import { usePersistentState } from '@/hooks/usePersistentState'
import IncomeExpenseChart from '@/components/charts/IncomeExpenseChart'
import FreshnessLine, { type MonthlyMeta } from '@/components/model/FreshnessLine'
import ProvenanceDrawer, { type ProvenanceQuery } from '@/components/provenance/ProvenanceDrawer'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet, PieChart, CalendarDays, X } from 'lucide-react'
import type { AccountingSummary } from '@/lib/integrations/accounting-map'

interface Metrics {
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  ledgerSources: string[]
  incomeStatement: {
    totalIncome: number
    totalExpenses: number
    netIncome: number
    netMargin: number | null
    expensesByCategory: { category: string; amount: number }[]
    byMonth: { month: string; income: number; expenses: number; net: number }[]
  }
}

interface MonthRow {
  month: string
  income: number
  expenses: number
  net: number
  netMargin: number | null
  expensesByCategory: { category: string; amount: number }[]
}

const monthLabel = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
const monthLabelLong = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const prevYm = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}
const lastYearYm = (ym: string) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`

/** % change vs a base; null when the base is zero/absent (no fake infinities). */
const pctChange = (cur: number, base: number | undefined | null): number | null =>
  base == null || base === 0 ? null : ((cur - base) / Math.abs(base)) * 100

const SOURCE_LABEL: Record<string, string> = { plaid: 'Bank', stripe: 'Stripe', quickbooks: 'QuickBooks', xero: 'Xero' }

const FAV = '#10B981'
const UNFAV = '#EF4444'

/** Color a change by favorability: for expenses, UP is unfavorable. */
const deltaColor = (delta: number | null, inverse = false): string => {
  if (delta == null || delta === 0) return 'var(--color-text-muted)'
  const good = inverse ? delta < 0 : delta > 0
  return good ? FAV : UNFAV
}
const fmtPct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)
const fmtPp = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`)
const fmtMoney = (v: number) => (v < 0 ? `(${formatCurrency(Math.abs(v), true)})` : formatCurrency(v, true))
const fmtDeltaMoney = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), true)}`)

export default function PLPage() {
  // Shared month scope across P&L and Expenses — pick March on one tab,
  // the other follows. null = YTD (default). Survives navigation.
  const [sel, setSel] = usePersistentState<string | null>('dashboard:selectedMonth', null)
  // Provenance drill-down: which figure's transactions are open (null = closed).
  const [prov, setProv] = useState<ProvenanceQuery | null>(null)

  const { data, loading, error, refetch } = usePageData(
    useCallback(async (signal: AbortSignal) => {
      const [m, pl, monthly] = await Promise.all([
        fetchJson<Metrics>('/api/metrics', signal), // required — drives the page
        // Accrual / GAAP figures (QuickBooks/Xero) — optional enrichment.
        fetchJson<{ accrual?: AccountingSummary | null }>('/api/pl', signal).catch(() => null),
        // Trailing 24 months for drill-down + prior-year comparison — optional.
        fetchJson<{ months: MonthRow[]; meta?: MonthlyMeta }>('/api/pl/monthly', signal).catch(() => null),
      ])
      return { m, accrual: pl?.accrual ?? null, months24: monthly?.months ?? [], meta: monthly?.meta ?? null }
    }, []),
  )
  const m = data?.m ?? null
  const accrual = data?.accrual ?? null
  const months24 = useMemo(() => data?.months24 ?? [], [data])
  const meta = data?.meta ?? null

  const is = m?.incomeStatement
  const anyConnected = !!(m?.sources && (m.sources.plaid || m.sources.stripe || m.sources.quickbooks || m.sources.xero))
  const hasFigures = !!is && (is.totalIncome !== 0 || is.totalExpenses !== 0)
  const sourceLabel = (m?.ledgerSources ?? []).map((s) => SOURCE_LABEL[s] ?? s).filter(Boolean).join(' + ') || '—'
  const chart = (is?.byMonth ?? []).map((b) => ({ month: monthLabel(b.month), income: b.income, expenses: b.expenses, net: b.net }))

  const byYm = useMemo(() => new Map(months24.map((r) => [r.month, r])), [months24])
  const currentYm = meta?.currentMonth ?? new Date().toISOString().slice(0, 7)

  // ── Scope: the figures + comparatives the cards and statement render ──────
  const scope = useMemo(() => {
    if (sel && byYm.has(sel)) {
      const cur = byYm.get(sel)!
      const isPartial = sel === currentYm
      const mom = byYm.get(prevYm(sel)) ?? null
      const yoy = byYm.get(lastYearYm(sel)) ?? null
      return {
        kind: 'month' as const,
        label: `${monthLabelLong(sel)}${isPartial ? ' (MTD)' : ''}`,
        income: cur.income, expenses: cur.expenses, net: cur.net, margin: cur.netMargin,
        categories: cur.expensesByCategory,
        isPartial, mom, yoy,
        momLabel: mom ? monthLabel(mom.month) : null,
        yoyLabel: yoy ? monthLabel(yoy.month) : null,
      }
    }
    // YTD (default): compare against the SAME SPAN of last year (Jan→current),
    // never a full prior year vs a partial current one.
    const year = currentYm.slice(0, 4)
    const ytdMonths = months24.filter((r) => r.month.slice(0, 4) === year && r.month <= currentYm)
    const lyMonths = ytdMonths
      .map((r) => byYm.get(lastYearYm(r.month)))
      .filter((r): r is MonthRow => r != null)
    const sum = (rows: { income: number; expenses: number; net: number }[]) => ({
      income: rows.reduce((s, r) => s + r.income, 0),
      expenses: rows.reduce((s, r) => s + r.expenses, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
    })
    const ly = lyMonths.length > 0 ? sum(lyMonths) : null
    return {
      kind: 'ytd' as const,
      label: 'Year-to-date',
      income: is?.totalIncome ?? 0, expenses: is?.totalExpenses ?? 0, net: is?.netIncome ?? 0, margin: is?.netMargin ?? null,
      categories: is?.expensesByCategory ?? [],
      isPartial: false, mom: null,
      yoy: ly ? { ...ly, netMargin: ly.income > 0 ? (ly.net / ly.income) * 100 : null } : null,
      momLabel: null,
      yoyLabel: ly ? `${monthLabel(lyMonths[0].month)}–${monthLabel(lyMonths[lyMonths.length - 1].month)}` : null,
    }
  }, [sel, byYm, months24, currentYm, is])

  // Headline trend on the cards = YoY (seasonality-free). Withheld for MTD —
  // a partial month is never graded (trust layer).
  const yoyTrends = scope.isPartial || !scope.yoy
    ? { income: undefined, expenses: undefined, net: undefined }
    : {
        income: pctChange(scope.income, scope.yoy.income) ?? undefined,
        expenses: pctChange(scope.expenses, scope.yoy.expenses) ?? undefined,
        net: pctChange(scope.net, scope.yoy.net) ?? undefined,
      }
  const trendLabel = scope.yoyLabel ? `vs ${scope.yoyLabel}` : 'vs last year'

  const yoyMargin: number | null =
    scope.yoy && 'netMargin' in scope.yoy && scope.yoy.netMargin != null ? scope.yoy.netMargin
    : scope.yoy && scope.yoy.income > 0 ? (scope.yoy.net / scope.yoy.income) * 100
    : null

  // ── Comparison statement rows (the CFO view: $ and % side by side) ────────
  const compareRows = [
    { label: 'Income', cur: scope.income, mom: scope.mom?.income ?? null, yoy: scope.yoy?.income ?? null, inverse: false },
    { label: 'Expenses', cur: scope.expenses, mom: scope.mom?.expenses ?? null, yoy: scope.yoy?.expenses ?? null, inverse: true },
    { label: 'Net Income', cur: scope.net, mom: scope.mom?.net ?? null, yoy: scope.yoy?.net ?? null, inverse: false },
  ]

  const hasAccrual = !!accrual && (accrual.totalIncome != null || accrual.netIncome != null)
  const accrualSource = accrual?.source === 'xero' ? 'Xero' : 'QuickBooks'
  const accrualRows: { label: string; value: number | null; color: string; bold?: boolean }[] = accrual
    ? [
        { label: 'Total Income', value: accrual.totalIncome, color: '#3B82F6' },
        ...(accrual.grossProfit != null ? [{ label: 'Gross Profit', value: accrual.grossProfit, color: '#14B8A6' }] : []),
        { label: 'Total Expenses', value: accrual.totalExpenses != null ? -accrual.totalExpenses : null, color: '#EF4444' },
        { label: 'Net Income', value: accrual.netIncome, color: (accrual.netIncome ?? 0) >= 0 ? '#10B981' : '#EF4444', bold: true },
      ]
    : []

  const tableRows = months24.length > 0 ? months24 : (is?.byMonth ?? []).map((r) => ({ ...r, netMargin: r.income > 0 ? (r.net / r.income) * 100 : null, expensesByCategory: [] }))
  const canDrill = months24.length > 0

  return (
    <div>
      <Header title="P&L Statement" subtitle="Profit & Loss — computed from your live transactions" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message="We couldn't load your P&L." onRetry={refetch} />
        ) : !anyConnected ? (
          <ConnectPrompt
            title="Connect a data source to see your P&L"
            message="Your profit & loss is computed from your live bank (Plaid), payment (Stripe), or accounting transactions — never demo data. Connect one to begin."
          />
        ) : !hasFigures ? (
          <ConnectPrompt
            title="No transactions yet"
            message="Your accounts are connected but no transactions have synced into your P&L period yet. They’ll appear here automatically as data comes in."
            cta="Review integrations"
          />
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#10B981' }} />
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)' }}>
                Live · {sourceLabel}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-muted)', border: '1px solid var(--color-surface-border)' }}>
                Cash basis
              </span>
              {/* Scope indicator — which period the cards below describe */}
              <span className="text-xs font-medium px-2 py-0.5 rounded-md flex items-center gap-1.5" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.35)' }}>
                <CalendarDays size={11} />
                {scope.label}
                {sel && (
                  <button onClick={() => setSel(null)} aria-label="Back to year-to-date" className="ml-0.5 rounded-full hover:opacity-70 transition-opacity">
                    <X size={11} />
                  </button>
                )}
              </span>
              {canDrill && !sel && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Click a month below to drill in</span>
              )}
            </div>

            {meta && <FreshnessLine meta={meta} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Total Income" value={formatCurrency(scope.income, true)} trend={yoyTrends.income} trendLabel={trendLabel} icon={<TrendingUp size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" subtitle={scope.kind === 'month' ? scope.label : undefined} tooltip={`Income from your transaction ledger for ${scope.label.toLowerCase()}, deduplicated against Stripe payouts. Trend compares the same period last year.`} />
              <MetricCard title="Total Expenses" value={formatCurrency(scope.expenses, true)} trend={yoyTrends.expenses} trendLabel={trendLabel} goodWhen="down" icon={<TrendingDown size={16} style={{ color: '#F59E0B' }} />} iconBg="rgba(245,158,11,0.15)" subtitle={scope.kind === 'month' ? scope.label : undefined} tooltip={`Operating expenses for ${scope.label.toLowerCase()}, excluding transfers and loan principal. Green when expenses are lower than the same period last year.`} />
              <MetricCard title="Net Income" value={formatCurrency(scope.net, true)} trend={yoyTrends.net} trendLabel={trendLabel} icon={scope.net >= 0 ? <TrendingUp size={16} style={{ color: '#10B981' }} /> : <TrendingDown size={16} style={{ color: '#EF4444' }} />} iconBg={scope.net >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} subtitle={scope.kind === 'month' ? scope.label : undefined} tooltip={`Income minus expenses for ${scope.label.toLowerCase()}.`} />
              <MetricCard title="Net Margin" value={scope.margin != null ? `${scope.margin.toFixed(1)}` : '—'} suffix={scope.margin != null ? '%' : ''} icon={<PieChart size={16} style={{ color: '#14B8A6' }} />} iconBg="rgba(20,184,166,0.15)" subtitle={!scope.isPartial && scope.margin != null && yoyMargin != null ? `${fmtPp(scope.margin - yoyMargin)} ${trendLabel}` : scope.kind === 'month' ? scope.label : undefined} tooltip="Net income as a percentage of total income. The comparison is in percentage points vs the same period last year." />
            </div>

            {scope.isPartial && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {monthLabelLong(sel!)} is still in progress — figures are month-to-date and aren&apos;t compared against prior periods until the month closes.
              </p>
            )}

            {/* P&L comparison — the statement read the way a CFO reads it */}
            {!scope.isPartial && (scope.yoy || scope.mom) && (
              <Card
                title={`P&L Comparison — ${scope.label}`}
                subtitle={scope.kind === 'month' ? 'Against the prior month (momentum) and the same month last year (growth)' : `Against the same span last year${scope.yoyLabel ? ` (${scope.yoyLabel})` : ''}`}
                tooltip="Same-month-last-year strips out seasonality — it's the honest growth signal. Prior-month shows momentum. Favorable moves are green: income and net up, expenses down."
                padding={false}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Line</th>
                        <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{scope.kind === 'month' ? monthLabel(sel!) : 'This YTD'}</th>
                        {scope.mom && <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{scope.momLabel}</th>}
                        {scope.mom && <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>MoM</th>}
                        {scope.yoy && <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{scope.kind === 'month' ? scope.yoyLabel : 'Prior YTD'}</th>}
                        {scope.yoy && <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Δ $</th>}
                        {scope.yoy && <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>YoY</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {compareRows.map(({ label, cur, mom, yoy, inverse }) => {
                        const momPct = pctChange(cur, mom)
                        const yoyPct = pctChange(cur, yoy)
                        const bold = label === 'Net Income'
                        return (
                          <tr key={label} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                            <td className={`px-4 py-3 ${bold ? 'font-semibold text-white' : ''}`} style={{ color: bold ? undefined : 'var(--color-text-secondary)' }}>{label}</td>
                            <td className={`px-4 py-3 text-right ${bold ? 'font-bold text-white' : 'font-medium text-white'}`}>{fmtMoney(cur)}</td>
                            {scope.mom && <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)' }}>{mom == null ? '—' : fmtMoney(mom)}</td>}
                            {scope.mom && <td className="px-4 py-3 text-right font-medium" style={{ color: deltaColor(momPct, inverse) }}>{fmtPct(momPct)}</td>}
                            {scope.yoy && <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)' }}>{yoy == null ? '—' : fmtMoney(yoy)}</td>}
                            {scope.yoy && <td className="px-4 py-3 text-right" style={{ color: deltaColor(yoy == null ? null : cur - yoy, inverse) }}>{fmtDeltaMoney(yoy == null ? null : cur - yoy)}</td>}
                            {scope.yoy && <td className="px-4 py-3 text-right font-medium" style={{ color: deltaColor(yoyPct, inverse) }}>{fmtPct(yoyPct)}</td>}
                          </tr>
                        )
                      })}
                      {/* Margin row — percentage points, never percent-of-percent */}
                      <tr>
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>Net Margin</td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: '#14B8A6' }}>{scope.margin != null ? `${scope.margin.toFixed(1)}%` : '—'}</td>
                        {scope.mom && <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)' }}>{scope.mom.netMargin != null ? `${scope.mom.netMargin.toFixed(1)}%` : '—'}</td>}
                        {scope.mom && <td className="px-4 py-3 text-right font-medium" style={{ color: deltaColor(scope.margin != null && scope.mom.netMargin != null ? scope.margin - scope.mom.netMargin : null) }}>{fmtPp(scope.margin != null && scope.mom.netMargin != null ? scope.margin - scope.mom.netMargin : null)}</td>}
                        {scope.yoy && <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)' }}>{yoyMargin != null ? `${yoyMargin.toFixed(1)}%` : '—'}</td>}
                        {scope.yoy && <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-muted)' }}>—</td>}
                        {scope.yoy && <td className="px-4 py-3 text-right font-medium" style={{ color: deltaColor(scope.margin != null && yoyMargin != null ? scope.margin - yoyMargin : null) }}>{fmtPp(scope.margin != null && yoyMargin != null ? scope.margin - yoyMargin : null)}</td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {chart.length > 0 && (
              <Card title="Income vs Expenses" subtitle="By month, year-to-date" tooltip="Monthly income and expenses with the net line, computed from your transaction ledger.">
                <IncomeExpenseChart data={chart} />
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {!!scope.categories.length && (
                <Card title="Expenses by Category" subtitle={scope.label} tooltip="Operating expenses grouped by auto-classified category, for the selected period.">
                  <div className="space-y-2.5">
                    {(() => {
                      const total = scope.categories.reduce((s, c) => s + c.amount, 0) || 1
                      return scope.categories.map(({ category, amount }) => {
                        const pct = (amount / total) * 100
                        return (
                          <div key={category}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{category}</span>
                              <span className="text-sm font-semibold" style={{ color: '#EF4444' }}>{formatCurrency(amount, true)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#EF4444', opacity: 0.7 }} />
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </Card>
              )}

              <Card title={scope.kind === 'month' ? `${scope.label} Summary` : 'YTD Summary'} subtitle="Income statement" tooltip={`Income statement for ${scope.label.toLowerCase()} from your transaction ledger.`}>
                <div className="space-y-3">
                  {([
                    { label: 'Total Income', value: scope.income, color: '#3B82F6', bucket: 'income' as const, figure: scope.income },
                    { label: 'Total Expenses', value: -scope.expenses, color: '#EF4444', bucket: 'expenses' as const, figure: scope.expenses },
                    { label: 'Net Income', value: scope.net, color: scope.net >= 0 ? '#10B981' : '#EF4444', bold: true },
                  ] as { label: string; value: number; color: string; bold?: boolean; bucket?: 'income' | 'expenses'; figure?: number }[]).map(({ label, value, color, bold, bucket, figure }) => (
                    <div key={label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                      <span className={`text-sm ${bold ? 'font-semibold text-white' : ''}`} style={{ color: bold ? undefined : 'var(--color-text-secondary)' }}>{label}</span>
                      {bucket ? (
                        <button
                          onClick={() => setProv({ label: `${scope.label} · ${bucket === 'income' ? 'Income' : 'Expenses'}`, figure: figure!, scope: scope.kind === 'month' ? 'month' : 'ytd', month: sel ?? undefined, bucket })}
                          className="text-sm font-medium hover:underline decoration-dotted underline-offset-2"
                          style={{ color }}
                          title="See the transactions behind this figure"
                        >
                          {value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}
                        </button>
                      ) : (
                        <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>{value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}</span>
                      )}
                    </div>
                  ))}
                  {scope.margin != null && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}><Wallet size={12} /> Net Margin</span>
                      <span className="text-sm font-bold" style={{ color: '#14B8A6' }}>{scope.margin.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {hasAccrual && (
              <Card
                title={`Accrual basis · ${accrualSource}`}
                subtitle="GAAP-basis figures, as recorded in your accounting system"
                tooltip="Pulled directly from your accounting system on an accrual basis (revenue/expenses when earned/incurred, including A/R, A/P, deferred revenue, and depreciation). These are your books' figures — accuracy depends on your bookkeeping being current."
              >
                <div className="space-y-3">
                  {accrualRows.map(({ label, value, color, bold }) => (
                    <div key={label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                      <span className={`text-sm ${bold ? 'font-semibold text-white' : ''}`} style={{ color: bold ? undefined : 'var(--color-text-secondary)' }}>{label}</span>
                      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>
                        {value == null ? '—' : value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}
                      </span>
                    </div>
                  ))}
                  {accrual!.outstandingAmount != null && accrual!.outstandingAmount > 0 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Outstanding invoices (A/R){accrual!.outstandingCount != null ? ` · ${accrual!.outstandingCount}` : ''}
                      </span>
                      <span className="text-sm font-medium" style={{ color: '#F59E0B' }}>{formatCurrency(accrual!.outstandingAmount, true)}</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {tableRows.length > 0 && (
              <Card
                title="Monthly Breakdown"
                subtitle={canDrill ? 'Trailing 24 months — click a month to generate its P&L above' : 'Income, expenses, and net by month'}
                padding={false}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                        {['Month', 'Income', 'Expenses', 'Net', 'Margin', 'Net YoY'].map((h) => (
                          <th key={h} className={`px-4 py-3 font-medium ${h === 'Month' ? 'text-left' : 'text-right'}`} style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...tableRows].reverse().map((row, i) => {
                        const margin = row.income > 0 ? (row.net / row.income) * 100 : null
                        const ly = byYm.get(lastYearYm(row.month))
                        const isMtd = row.month === currentYm
                        const yoyNet = isMtd ? null : pctChange(row.net, ly?.net)
                        const selected = sel === row.month
                        return (
                          <tr
                            key={row.month}
                            onClick={canDrill ? () => setSel(selected ? null : row.month) : undefined}
                            className={canDrill ? 'cursor-pointer transition-colors' : ''}
                            style={{
                              borderBottom: '1px solid var(--color-surface-border)',
                              backgroundColor: selected ? 'rgba(59,130,246,0.10)' : i % 2 === 0 ? 'transparent' : 'var(--color-surface-bg)',
                              boxShadow: selected ? 'inset 3px 0 0 #3B82F6' : undefined,
                            }}
                            aria-selected={selected}
                          >
                            <td className="px-4 py-3 font-medium text-white">
                              {monthLabel(row.month)}
                              {isMtd && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>MTD</span>}
                            </td>
                            <td className="px-4 py-3 text-right" style={{ color: '#3B82F6' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setProv({ label: `${monthLabelLong(row.month)} · Income`, figure: row.income, scope: 'month', month: row.month, bucket: 'income' }) }}
                                className="hover:underline decoration-dotted underline-offset-2"
                                title="See the transactions behind this figure"
                              >
                                {formatCurrency(row.income, true)}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right" style={{ color: '#EF4444' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setProv({ label: `${monthLabelLong(row.month)} · Expenses`, figure: row.expenses, scope: 'month', month: row.month, bucket: 'expenses' }) }}
                                className="hover:underline decoration-dotted underline-offset-2"
                                title="See the transactions behind this figure"
                              >
                                {formatCurrency(row.expenses, true)}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold" style={{ color: row.net >= 0 ? '#10B981' : '#EF4444' }}>{formatCurrency(row.net, true)}</td>
                            <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)' }}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</td>
                            <td className="px-4 py-3 text-right font-medium" style={{ color: deltaColor(yoyNet) }}>{isMtd ? '—' : fmtPct(yoyNet)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Cash basis — revenue is recognized when payment is received and expenses when paid. This is not a GAAP accrual statement: it excludes accounts receivable/payable, deferred revenue (subscriptions paid up front are counted in the month collected), prepaid amortization, depreciation, and loan interest.
              {hasAccrual
                ? ` For accrual/GAAP figures, see the "Accrual basis · ${accrualSource}" card above — pulled live from your accounting system.`
                : ' For accrual/GAAP figures, connect QuickBooks or Xero and they’ll appear here alongside your cash-basis numbers.'}
            </p>
          </>
        )}
      </div>

      {prov && <ProvenanceDrawer query={prov} onClose={() => setProv(null)} />}
    </div>
  )
}
