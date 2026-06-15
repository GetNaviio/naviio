'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePersistentState } from '@/hooks/usePersistentState'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import ConnectPrompt from '@/components/ConnectPrompt'
import { formatCurrency } from '@/lib/utils'
import { projectModel, projectionTotals } from '@/lib/model/project'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Download, Printer, Sparkles, PieChart, Target, Percent, Gauge } from 'lucide-react'
import NaviBadge from '@/components/ui/NaviBadge'
import WorkforceTab from '@/components/model/WorkforceTab'
import BudgetTab from '@/components/model/BudgetTab'
import TtmTab from '@/components/model/TtmTab'

interface Statement {
  revenue: number; cogs: number; grossProfit: number; grossMargin: number | null
  opex: number; operatingIncome: number; operatingMargin: number | null
}

type Tab = 'analysis' | 'reporting' | 'forecast' | 'ttm' | 'budget' | 'workforce' | 'consolidated' | 'commentary'
const TABS: { id: Tab; label: string }[] = [
  { id: 'analysis', label: 'Financial Analysis' },
  { id: 'reporting', label: 'Management Reporting' },
  { id: 'forecast', label: 'Cash Flow Forecasting' },
  { id: 'ttm', label: 'TTM Forecast' },
  { id: 'budget', label: 'Budget vs Actuals' },
  { id: 'workforce', label: 'Workforce Planning' },
  { id: 'consolidated', label: 'Consolidated Reporting' },
  { id: 'commentary', label: 'Commentary Writer' },
]

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

export default function ModelPage() {
  const [stmt, setStmt] = useState<Statement | null>(null)
  const [hasData, setHasData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = usePersistentState<Tab>('model:tab', 'analysis')
  const [exporting, setExporting] = useState(false)

  // Projection assumptions (seeded from live run-rate).
  const [months, setMonths] = useState(12)
  const [startRevenue, setStartRevenue] = useState(0)
  const [growthPct, setGrowthPct] = useState(5)
  const [grossMarginPct, setGrossMarginPct] = useState(70)
  const [startOpex, setStartOpex] = useState(0)
  const [opexGrowthPct, setOpexGrowthPct] = useState(2)

  // AI commentary
  const [commentary, setCommentary] = useState('')
  const [commentaryAt, setCommentaryAt] = useState<string | null>(null)
  const [commentaryLoading, setCommentaryLoading] = useState(false)
  const [commentaryError, setCommentaryError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/model')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return
        if (d) {
          setStmt(d.statement); setHasData(!!d.hasData)
          if (d.defaults) {
            setStartRevenue(d.defaults.monthlyRevenue || 0)
            setStartOpex(d.defaults.monthlyOpex || 0)
            if (d.defaults.grossMarginPct) setGrossMarginPct(d.defaults.grossMarginPct)
          }
        }
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    // Paid output is persisted server-side — reload the latest commentary so
    // navigating away (or closing the browser) never costs the user their result.
    fetch('/api/model/commentary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.commentary) return
        setCommentary(d.commentary)
        setCommentaryAt(d.generatedAt ?? null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const rows = useMemo(
    () => projectModel({ months, startRevenue, monthlyGrowth: growthPct / 100, grossMargin: grossMarginPct / 100, startOpex, opexGrowth: opexGrowthPct / 100 }),
    [months, startRevenue, growthPct, grossMarginPct, startOpex, opexGrowthPct],
  )
  const totals = useMemo(() => projectionTotals(rows), [rows])
  const chartData = rows.map((r) => ({ month: `M${r.month}`, Revenue: r.revenue, 'Operating Income': r.operatingIncome }))

  // Profitability ratios (OpEx treated as fixed; contribution margin ≈ gross margin).
  const breakeven = stmt && stmt.grossMargin && stmt.grossMargin > 0 ? stmt.opex / stmt.grossMargin : null
  const marginOfSafety = stmt && breakeven != null && stmt.revenue > 0 ? (stmt.revenue - breakeven) / stmt.revenue : null

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/model/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months, startRevenue, growthPct, grossMarginPct, startOpex, opexGrowthPct }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = 'naviio-financial-model.xlsx'; link.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const generateCommentary = async () => {
    setCommentaryLoading(true); setCommentaryError(null)
    try {
      const res = await fetch('/api/model/commentary', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setCommentaryError(d.error ?? 'Could not generate commentary.'); return }
      setCommentary(d.commentary || '')
      setCommentaryAt(d.generatedAt ?? new Date().toISOString())
    } catch {
      setCommentaryError('Could not generate commentary.')
    } finally { setCommentaryLoading(false) }
  }

  const numInput = (label: string, value: number, set: (n: number) => void, suffix?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--color-text-primary)' }} />
        {suffix && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{suffix}</span>}
      </div>
    </label>
  )

  const plRows = (s: Statement) => [
    { label: 'Revenue', value: s.revenue, color: '#3B82F6' },
    { label: 'COGS', value: -s.cogs, color: '#F59E0B' },
    { label: `Gross Profit · ${pct(s.grossMargin)} margin`, value: s.grossProfit, color: '#14B8A6', bold: true },
    { label: 'Operating Expenses', value: -s.opex, color: '#EF4444' },
    { label: `Operating Income · ${pct(s.operatingMargin)} margin`, value: s.operatingIncome, color: s.operatingIncome >= 0 ? '#10B981' : '#EF4444', bold: true },
  ]
  const renderPL = (s: Statement) => (
    <Card title="Income statement · year-to-date" subtitle="Cash basis, computed from your transactions">
      <div className="space-y-2">
        {plRows(s).map(({ label, value, color, bold }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className={`text-sm ${bold ? 'font-semibold text-white' : ''}`} style={{ color: bold ? undefined : 'var(--color-text-secondary)' }}>{label}</span>
            <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>{value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}</span>
          </div>
        ))}
      </div>
    </Card>
  )

  return (
    <div>
      <Header title="Financial Model" subtitle="Analysis, reporting, forecasting, consolidation, and AI commentary — in one place" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}
          </div>
        ) : !hasData ? (
          <ConnectPrompt title="Connect a data source to build your model" message="The model is computed from your live bank (Plaid) and payment (Stripe) transactions. Connect one to unlock analysis, reporting, forecasting and AI commentary." />
        ) : (
          <>
            {/* Pillar tabs */}
            <div className="flex flex-wrap gap-1.5 no-print">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={tab === t.id
                    ? { backgroundColor: 'rgba(0,196,159,0.15)', color: '#00C49F', border: '1px solid rgba(0,196,159,0.4)' }
                    : { backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="print-area space-y-4 sm:space-y-6">
              {/* 1 · FINANCIAL ANALYSIS */}
              {tab === 'analysis' && stmt && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard title="Gross Margin" value={pct(stmt.grossMargin)} icon={<Percent size={16} style={{ color: '#14B8A6' }} />} iconBg="rgba(20,184,166,0.15)" tooltip="Gross profit ÷ revenue." />
                    <MetricCard title="Operating Margin" value={pct(stmt.operatingMargin)} icon={<PieChart size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" tooltip="Operating income ÷ revenue." />
                    <MetricCard title="Breakeven Revenue" value={breakeven != null ? formatCurrency(breakeven, true) : '—'} icon={<Target size={16} style={{ color: '#F59E0B' }} />} iconBg="rgba(245,158,11,0.15)" tooltip="OpEx ÷ gross margin — revenue needed to cover costs (OpEx treated as fixed)." />
                    <MetricCard title="Margin of Safety" value={pct(marginOfSafety)} icon={<Gauge size={16} style={{ color: '#10B981' }} />} iconBg="rgba(16,185,129,0.15)" tooltip="How far revenue can fall before hitting breakeven." />
                  </div>
                  {renderPL(stmt)}
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Breakeven and margin of safety treat operating expenses as fixed and gross margin as the contribution margin — a planning approximation.</p>
                </>
              )}

              {/* 2 · MANAGEMENT REPORTING */}
              {tab === 'reporting' && stmt && (
                <>
                  <Card title="Build & share a management report" subtitle="Export the model for the board, lenders, or your own records">
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={exportExcel} disabled={exporting} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 no-print" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.35)' }}>
                        <Download size={14} /> {exporting ? 'Building…' : 'Export to Excel (live formulas)'}
                      </button>
                      <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors no-print" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.35)' }}>
                        <Printer size={14} /> Save as PDF
                      </button>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Excel includes editable assumptions; PDF captures this report.</span>
                    </div>
                  </Card>
                  {renderPL(stmt)}
                </>
              )}

              {/* 3 · CASH FLOW FORECASTING */}
              {tab === 'forecast' && (
                <>
                  <Card title="Projection assumptions" subtitle="Seeded from your run-rate — edit to model scenarios">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {numInput('Horizon', months, (n) => setMonths(Math.max(1, Math.min(60, Math.round(n)))), 'mo')}
                      {numInput('Start revenue', startRevenue, setStartRevenue, '$/mo')}
                      {numInput('Revenue growth', growthPct, setGrowthPct, '%/mo')}
                      {numInput('Gross margin', grossMarginPct, setGrossMarginPct, '%')}
                      {numInput('Start OpEx', startOpex, setStartOpex, '$/mo')}
                      {numInput('OpEx growth', opexGrowthPct, setOpexGrowthPct, '%/mo')}
                    </div>
                  </Card>
                  <Card title="Projected revenue & operating income" subtitle={`${months}-month projection`}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => formatCurrency(v as number, true)} width={64} />
                        <Tooltip formatter={(v) => formatCurrency(v as number, true)} contentStyle={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderRadius: 8, fontSize: 12 }} />
                        <Line type="monotone" dataKey="Revenue" stroke="#3B82F6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Operating Income" stroke="#10B981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Monthly projection" subtitle="Revenue → COGS → Gross Profit → OpEx → Operating Income" padding={false}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                            {['Month', 'Revenue', 'COGS', 'Gross Profit', 'OpEx', 'Operating Income'].map((h) => (
                              <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={r.month} style={{ borderBottom: '1px solid var(--color-surface-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-surface-bg)' }}>
                              <td className="px-4 py-2.5 font-medium text-white">{r.month}</td>
                              <td className="px-4 py-2.5" style={{ color: '#3B82F6' }}>{formatCurrency(r.revenue, true)}</td>
                              <td className="px-4 py-2.5" style={{ color: '#F59E0B' }}>{formatCurrency(r.cogs, true)}</td>
                              <td className="px-4 py-2.5" style={{ color: '#14B8A6' }}>{formatCurrency(r.grossProfit, true)}</td>
                              <td className="px-4 py-2.5" style={{ color: '#EF4444' }}>{formatCurrency(r.opex, true)}</td>
                              <td className="px-4 py-2.5 font-semibold" style={{ color: r.operatingIncome >= 0 ? '#10B981' : '#EF4444' }}>{formatCurrency(r.operatingIncome, true)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid var(--color-surface-border)' }}>
                            <td className="px-4 py-2.5 font-bold text-white">Total</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: '#3B82F6' }}>{formatCurrency(totals.revenue, true)}</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: '#F59E0B' }}>{formatCurrency(totals.cogs, true)}</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: '#14B8A6' }}>{formatCurrency(totals.grossProfit, true)}</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: '#EF4444' }}>{formatCurrency(totals.opex, true)}</td>
                            <td className="px-4 py-2.5 font-bold" style={{ color: totals.operatingIncome >= 0 ? '#10B981' : '#EF4444' }}>{formatCurrency(totals.operatingIncome, true)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {/* 4 · CONSOLIDATED REPORTING */}
              {tab === 'ttm' && (
                <TtmTab assumptions={{ startRevenue, growthPct, grossMarginPct, startOpex, opexGrowthPct }} />
              )}

              {tab === 'budget' && <BudgetTab />}

              {tab === 'workforce' && <WorkforceTab />}

              {tab === 'consolidated' && stmt && (
                <>
                  <Card title="Consolidated P&L" subtitle="Combined across all your connected accounts">
                    <div className="space-y-2">
                      {plRows(stmt).map(({ label, value, color, bold }) => (
                        <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                          <span className={`text-sm ${bold ? 'font-semibold text-white' : ''}`} style={{ color: bold ? undefined : 'var(--color-text-secondary)' }}>{label}</span>
                          <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>{value < 0 ? `(${formatCurrency(Math.abs(value), true)})` : formatCurrency(value, true)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    These figures are consolidated across every account you&apos;ve connected (bank + payments). Multi-entity consolidation — combining separate businesses with intercompany eliminations and multi-currency — is on the roadmap.
                  </p>
                </>
              )}

              {/* 5 · COMMENTARY WRITER */}
              {tab === 'commentary' && (
                <Card title="AI Commentary Writer" badge={<NaviBadge />} subtitle="Navi reads your live numbers and writes board-ready commentary" tooltip="Generates an executive analysis from your actual figures — never invented numbers. Costs 2 credits.">
                  {!commentary && !commentaryLoading && (
                    <button onClick={generateCommentary} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors no-print" style={{ backgroundColor: 'rgba(0,196,159,0.15)', color: '#00C49F', border: '1px solid rgba(0,196,159,0.4)' }}>
                      <Sparkles size={15} /> Generate commentary · 2 credits
                    </button>
                  )}
                  {commentaryLoading && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Navi is writing your commentary…</p>}
                  {commentaryError && <p className="text-sm" style={{ color: '#F59E0B' }}>{commentaryError}</p>}
                  {commentary && (
                    <div className="space-y-3">
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{commentary}</p>
                      <div className="flex items-center gap-3 no-print">
                        <button onClick={generateCommentary} disabled={commentaryLoading} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>Regenerate · 2 credits</button>
                        {commentaryAt && (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Generated {new Date(commentaryAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
