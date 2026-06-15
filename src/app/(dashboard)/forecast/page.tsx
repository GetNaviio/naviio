'use client'

import { useState, useMemo, useEffect } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import NaviBadge from '@/components/ui/NaviBadge'
import MetricCard from '@/components/ui/MetricCard'
import ForecastChart from '@/components/forecast/ForecastChart'
import ConnectPrompt from '@/components/ConnectPrompt'
import { generateForecast, BASE_CHURN_RATE } from '@/lib/forecasting/engine'
import type { CohortSeries } from '@/lib/forecasting/cohorts'
import { hasSufficientCohortData } from '@/lib/forecasting/cohorts'
import type { Waterfall } from '@/lib/metrics/mrr'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Clock, DollarSign, LineChart } from 'lucide-react'

const HORIZONS = [3, 6, 12] as const
type Horizon = typeof HORIZONS[number]

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          accentColor: 'var(--color-info)',
          backgroundColor: 'var(--color-surface-border)',
        }}
      />
      <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [horizon,    setHorizon]    = useState<Horizon>(12)
  // Neutral default assumptions (NOT derived from demo data) — the user adjusts these.
  const [growthRate, setGrowthRate] = useState(3)
  const [churnRate,  setChurnRate]  = useState(() => parseFloat((BASE_CHURN_RATE * 100).toFixed(2)))
  const [live, setLive] = useState<{ mrr: number; cash: number; opex: number } | null>(null)
  // Unit economics for driver-based opex: CAC (marketing ÷ new customers) and
  // ARPU (MRR ÷ customers) from the live metrics. When both are derivable, opex
  // splits into other-opex growth + S&M = projected new logos × CAC. Null until
  // we have new customers + marketing spend + a customer count.
  const [opexDrivers, setOpexDrivers] =
    useState<{ cac: number; arpu: number; currentMarketingSpend: number } | null>(null)
  // Real last-period MRR movement (new / expansion / contraction / churn). When
  // present, the base case is driver-based off the customer's actual split
  // instead of the single-rate sliders. Null until ≥2 MRR snapshots exist.
  const [waterfall, setWaterfall] = useState<Waterfall | null>(null)
  // Real per-cohort retention. When it has enough signal, the existing base is
  // aged forward on an empirical retention curve (cohort-decay) instead of one
  // blended churn rate. Empty until cohorts with ≥1 month of aging exist.
  const [cohorts, setCohorts] = useState<CohortSeries[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/stripe/metrics').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/revenue/movement').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([mx, sm, mv]) => {
      if (!alive) return
      const mrr = sm?.source === 'stripe' && sm.metrics ? (sm.metrics.mrr ?? 0) : 0
      const cash = mx?.cash?.balance ?? 0
      const monthsEl = new Date().getUTCMonth() + 1
      const opex = mx?.incomeStatement?.totalExpenses ? mx.incomeStatement.totalExpenses / monthsEl : 0
      if (mrr > 0) { setLive({ mrr, cash, opex }); setConnected(true) }
      // Derive unit economics for driver-based opex from the already-fetched
      // metrics. CAC = this month's marketing spend ÷ new customers (only when
      // newThisMonth > 0); ARPU = MRR ÷ total customers (only when total > 0).
      // Both must be > 0 to tie S&M to projected new logos; otherwise the engine
      // falls back to flat opex growth.
      const marketing = mx?.marketing?.thisMonth ?? 0
      const cust = sm?.source === 'stripe' && sm.metrics ? sm.metrics.customers : null
      const newThisMonth = cust?.newThisMonth ?? 0
      const totalCustomers = cust?.total ?? 0
      const cac = newThisMonth > 0 ? marketing / newThisMonth : 0
      const arpu = totalCustomers > 0 ? mrr / totalCustomers : 0
      if (cac > 0 && arpu > 0) {
        setOpexDrivers({ cac, arpu, currentMarketingSpend: marketing })
      }
      // Only use real movement when at least two snapshots produced a waterfall.
      if (mv?.waterfall && mv.waterfall.startMrr > 0) setWaterfall(mv.waterfall as Waterfall)
      if (Array.isArray(mv?.cohorts)) setCohorts(mv.cohorts as CohortSeries[])
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const currentMrr = live?.mrr ?? 0
  const result = useMemo(
    () => generateForecast(
      horizon,
      growthRate / 100,
      churnRate / 100,
      live
        ? {
            startMrr: live.mrr,
            startCash: live.cash,
            startOpex: live.opex,
            revenueToMrr: 1,
            opexGrowthRate: growthRate / 100,
            live: true,
            // Driver-based projection from real movement when we have it; the
            // sliders still drive opex/scenario tilts. Falls back to single-rate
            // compounding (today's behavior) when there's no movement history.
            ...(waterfall ? { drivers: waterfall } : {}),
            // Cohort-decay retention from real cohorts (higher fidelity than a
            // single blended churn rate). Activates inside the engine only when
            // the cohort table has enough aging signal AND a waterfall is present.
            ...(cohorts.length ? { cohorts } : {}),
            // Unit-economics-constrained opex: S&M driven by projected new logos
            // × CAC. Activates inside the engine only when a waterfall is present
            // (to seed the new-MRR stream); otherwise opex stays flat-growth.
            ...(opexDrivers ? { opexDrivers } : {}),
          }
        : {},
    ),
    [horizon, growthRate, churnRate, live, waterfall, cohorts, opexDrivers],
  )

  // Whether the engine is using the cohort-decay path (drives the note copy).
  const cohortActive = !!waterfall && hasSufficientCohortData(cohorts)
  // Whether opex is driver-based (S&M = projected new logos × CAC). The engine
  // gates this on a waterfall being present (to seed the new-MRR stream).
  const opexDriverActive = !!waterfall && !!opexDrivers

  const { summary, data } = result

  if (loading) {
    return (
      <div>
        <Header title="Revenue Forecast" subtitle="Projection from your live MRR and cash" />
        <div className="p-4 sm:p-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}</div></div>
      </div>
    )
  }
  if (!connected) {
    return (
      <div>
        <Header title="Revenue Forecast" subtitle="Projection from your live MRR and cash" />
        <div className="p-4 sm:p-6">
          <ConnectPrompt
            icon={<LineChart size={20} />}
            title="Connect Stripe to forecast revenue"
            message="The forecast projects forward from your current MRR and cash balance. Connect Stripe (and a bank for cash/runway) to generate live projections."
            cta="Connect Stripe"
          />
        </div>
      </div>
    )
  }

  const scenarioRows = [
    { label: 'Bear Case', key: 'bear' as const, color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  desc: '50% growth, higher churn' },
    { label: 'Base Case', key: 'base' as const, color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', desc: 'Current trend maintained'   },
    { label: 'Bull Case', key: 'bull' as const, color: '#10B981', bg: 'rgba(16,185,129,0.08)', desc: '150% growth, lower churn'  },
  ]

  return (
    <div>
      <Header
        title="Revenue Forecast"
        subtitle={`AI-powered projection · ${horizon}-month horizon`}
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Horizon selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Forecast horizon:</span>
          <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className="px-3 py-1 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: horizon === h ? 'var(--color-info)' : 'transparent',
                  color: horizon === h ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {h}mo
              </button>
            ))}
          </div>
        </div>

        {/* Summary metric cards — base scenario */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title={`Projected MRR (Base, ${horizon}mo)`}
            value={formatCurrency(summary.base.mrr, true)}
            trend={currentMrr ? ((summary.base.mrr - currentMrr) / currentMrr) * 100 : undefined}
            trendLabel="vs current MRR"
            icon={<TrendingUp size={16} style={{ color: '#3B82F6' }} />}
            iconBg="rgba(59,130,246,0.15)"
            tooltip="Projected MRR at end of forecast period under the base-case scenario (current growth trend maintained)."
          />
          <MetricCard
            title={`Projected ARR (Base, ${horizon}mo)`}
            value={formatCurrency(summary.base.arr, true)}
            trend={currentMrr ? ((summary.base.arr - currentMrr * 12) / (currentMrr * 12)) * 100 : undefined}
            trendLabel="vs current ARR"
            icon={<DollarSign size={16} style={{ color: '#10B981' }} />}
            iconBg="rgba(16,185,129,0.15)"
            tooltip="Annualised recurring revenue at end of the forecast period, base scenario."
          />
          <MetricCard
            title="Runway (Base)"
            value={summary.base.runway > 90 ? '90+' : `${summary.base.runway}`}
            suffix=" mo"
            icon={<Clock size={16} style={{ color: '#8B5CF6' }} />}
            iconBg="rgba(139,92,246,0.15)"
            subtitle={`Cash: ${formatCurrency(summary.base.cashBalance, true)}`}
            tooltip="Estimated months of runway at end of forecast under base-case assumptions."
          />
          <MetricCard
            title="Bear MRR Risk"
            value={formatCurrency(summary.bear.mrr, true)}
            trend={((summary.bear.mrr - summary.base.mrr) / summary.base.mrr) * 100}
            trendLabel="vs base case"
            icon={<TrendingDown size={16} style={{ color: '#EF4444' }} />}
            iconBg="rgba(239,68,68,0.15)"
            tooltip="Projected MRR in the bear scenario — 50% growth rate with elevated churn. Represents downside risk."
          />
        </div>

        {/* Chart */}
        <Card
          title="MRR Forecast — 3 Scenarios"
          badge={<NaviBadge />}
          subtitle={`${horizon}-month projection from your current MRR`}
          tooltip="Solid line = historical MRR. Dashed lines show bear / base / bull projections. The shaded band represents the confidence interval between bear and bull cases."
        >
          <ForecastChart data={data} horizonMonths={horizon} />
        </Card>

        {/* Assumptions + scenario comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Assumption sliders */}
          <Card title="Scenario Assumptions" subtitle="Adjust to model custom outcomes">
            <div className="space-y-6">
              <Slider
                label="Monthly MRR Growth Rate"
                value={growthRate}
                min={0.5}
                max={10}
                step={0.1}
                format={(v) => `${v.toFixed(1)}%`}
                onChange={setGrowthRate}
              />
              <Slider
                label="Monthly Churn Rate"
                value={churnRate}
                min={0.5}
                max={8}
                step={0.1}
                format={(v) => `${v.toFixed(1)}%`}
                onChange={setChurnRate}
              />
              <div className="pt-2 space-y-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {cohortActive ? (
                  <p>
                    Base case uses <strong>cohort-decay retention</strong> from your actual
                    cohorts: the existing base is aged forward on each cohort&apos;s real
                    retention curve, expansion layers on the retained base, and new MRR
                    enters as fresh cohorts that decay on the same curve. Bear &amp; bull
                    tilt the retention curve and new-MRR.
                  </p>
                ) : waterfall ? (
                  <p>
                    Base case is <strong>driver-based</strong> from your actual MRR movement
                    (new / expansion / contraction / churn). Bear &amp; bull tilt those real
                    drivers; the churn slider applies when no movement history exists.
                  </p>
                ) : null}
                {opexDriverActive && (
                  <p>
                    Opex is <strong>S&amp;M driven by your CAC × projected new customers</strong>:
                    each month&apos;s sales &amp; marketing spend = (new-logo MRR ÷ ARPU) × CAC,
                    while payroll/G&amp;A/infra grow at your base opex rate. Bear pays more per
                    logo, bull less.
                  </p>
                )}
                <p>· <strong>Bear</strong>: 50% of growth, 130% churn/contraction</p>
                <p>· <strong>Base</strong>: {cohortActive ? 'cohort-decay retention from your actual cohorts' : waterfall ? 'your real movement' : 'sliders as set'}</p>
                <p>· <strong>Bull</strong>: 150% growth, 70% churn/contraction</p>
              </div>
            </div>
          </Card>

          {/* Scenario comparison table */}
          <div className="lg:col-span-2">
            <Card title="Scenario Comparison" subtitle={`End-of-period projections · ${horizon} months`} padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                      {['Scenario', 'MRR', 'ARR', 'Cash Balance', 'Runway', 'Cumulative Rev.'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioRows.map(({ label, key, color, bg, desc }) => {
                      const s = summary[key]
                      return (
                        <tr key={key} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <div>
                                <p className="font-semibold text-xs" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold" style={{ color }}>{formatCurrency(s.mrr, true)}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(s.arr, true)}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(s.cashBalance, true)}</td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ backgroundColor: bg, color }}
                            >
                              {s.runway > 90 ? '90+ mo' : `${s.runway} mo`}
                            </span>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(s.cumulativeRevenue, true)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>

        {/* Monthly breakdown for base case */}
        <Card title="Base Case — Monthly Breakdown" subtitle={`Projected MRR by month · ${horizon} months`} padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                  {['Month', 'Bear MRR', 'Base MRR', 'Bull MRR', 'MoM Δ (Base)'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.filter((d) => !d.isHistorical).map((d, i, arr) => {
                  const prev = i === 0 ? currentMrr : arr[i - 1].base ?? currentMrr
                  const delta = d.base != null && prev ? ((d.base - prev) / prev) * 100 : null
                  return (
                    <tr
                      key={d.month}
                      style={{
                        borderBottom: '1px solid var(--color-surface-border)',
                        backgroundColor: i % 2 === 1 ? 'var(--color-surface-bg)' : 'transparent',
                      }}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>{d.month}</td>
                      <td className="px-4 py-2.5" style={{ color: '#EF4444' }}>{d.bear != null ? formatCurrency(d.bear, true) : '—'}</td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: '#3B82F6' }}>{d.base != null ? formatCurrency(d.base, true) : '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: '#10B981' }}>{d.bull != null ? formatCurrency(d.bull, true) : '—'}</td>
                      <td className="px-4 py-2.5">
                        {delta != null && (
                          <span className="text-xs font-medium" style={{ color: delta >= 0 ? '#10B981' : '#EF4444' }}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  )
}
