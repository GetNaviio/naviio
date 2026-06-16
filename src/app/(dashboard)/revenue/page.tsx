'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import MobileHero from '@/components/dashboard/MobileHero'
import ConnectPrompt from '@/components/ConnectPrompt'
import type { StripeMetrics } from '@/lib/integrations/stripe'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Users, Activity, BarChart3, LineChart } from 'lucide-react'

const money = (v: number | null | undefined) => (v == null ? '—' : formatCurrency(v, true))

interface Waterfall { startMrr: number; newMrr: number; expansionMrr: number; contractionMrr: number; churnedMrr: number; endMrr: number; netNewMrr: number }
interface Movement {
  periods: number
  waterfall: Waterfall | null
  nrr: number | null
  grr: number | null
  cohorts: { cohort: string; base: number; points: { offset: number; pct: number }[] }[]
}

export default function RevenuePage() {
  const [m, setM] = useState<StripeMetrics | null>(null)
  const [mv, setMv] = useState<Movement | null>(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/stripe/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/revenue/movement').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, move]) => {
      if (!active) return
      if (d?.source === 'stripe' && d.metrics) { setM(d.metrics as StripeMetrics); setConnected(true) }
      if (move) setMv(move as Movement)
      setLoading(false)
    }).catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const total = m?.customers?.total ?? 0
  const mrr = m?.mrr ?? 0
  const arpu = total ? mrr / total : 0
  // MRR month-over-month % from the movement waterfall (net new ÷ starting MRR).
  const mrrTrend = mv?.waterfall && mv.waterfall.startMrr
    ? (mv.waterfall.netNewMrr / mv.waterfall.startMrr) * 100
    : null

  return (
    <div>
      <Header title="Revenue Intelligence" subtitle="MRR, ARR, churn, and LTV — powered by Stripe" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}
          </div>
        ) : !connected ? (
          <ConnectPrompt
            icon={<LineChart size={20} />}
            title="Connect Stripe to see revenue intelligence"
            message="MRR, ARR, churn, LTV, and customer metrics are pulled live from your Stripe account. Connect Stripe to populate this page."
            cta="Connect Stripe"
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
                Live · Stripe
              </span>
            </div>

            {/* Mobile: hero (MRR) + 3 chips. Desktop keeps the 4-card grid. */}
            <MobileHero
              label="MRR"
              value={money(mrr)}
              trend={mrrTrend}
              sub={`ARR ${money(m?.arr)}${mv?.nrr != null ? ` · ${mv.nrr.toFixed(0)}% NRR` : ''}`}
              chips={[
                { label: 'ARR', value: money(m?.arr), color: '#3B82F6' },
                { label: 'Customers', value: total.toLocaleString(), color: '#10B981' },
                { label: 'Churn', value: `${((m?.churnRate ?? 0) * 100).toFixed(1)}%`, color: '#EF4444' },
              ]}
            />

            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="MRR" value={money(mrr)} icon={<TrendingUp size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" subtitle={`ARR ${money(m?.arr)}`} tooltip="Monthly Recurring Revenue — normalized monthly value of all active Stripe subscriptions." />
              <MetricCard title="Active Customers" value={total.toLocaleString()} icon={<Users size={16} style={{ color: '#10B981' }} />} iconBg="rgba(16,185,129,0.15)" subtitle={`+${m?.customers?.newThisMonth ?? 0} this month`} tooltip="Customers with active subscriptions, from Stripe." />
              <MetricCard title="Churn Rate" value={`${((m?.churnRate ?? 0) * 100).toFixed(2)}`} suffix="%" icon={<Activity size={16} style={{ color: '#EF4444' }} />} iconBg="rgba(239,68,68,0.15)" tooltip="Monthly logo churn — share of customers lost to cancellation." />
              <MetricCard title="LTV" value={money(m?.ltv ?? null)} icon={<BarChart3 size={16} style={{ color: '#8B5CF6' }} />} iconBg="rgba(139,92,246,0.15)" subtitle={`ARPU ${formatCurrency(arpu)}/mo`} tooltip="Customer Lifetime Value — ARPU ÷ churn rate." />
            </div>

            {mv?.waterfall && mv.nrr != null ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard title="NRR" value={`${mv.nrr.toFixed(1)}`} suffix="%" icon={<TrendingUp size={16} style={{ color: '#10B981' }} />} iconBg="rgba(16,185,129,0.15)" tooltip="Net Revenue Retention — MRR retained from existing customers incl. expansion, excl. new. >100% means existing customers grow revenue." />
                  <MetricCard title="New MRR" value={money(mv.waterfall.newMrr)} icon={<TrendingUp size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" tooltip="MRR from brand-new subscriptions this period." />
                  <MetricCard title="Expansion MRR" value={money(mv.waterfall.expansionMrr)} icon={<TrendingUp size={16} style={{ color: '#14B8A6' }} />} iconBg="rgba(20,184,166,0.15)" tooltip="Added MRR from existing customers who upgraded." />
                  <MetricCard title="Churned MRR" value={money(mv.waterfall.churnedMrr + mv.waterfall.contractionMrr)} icon={<Activity size={16} style={{ color: '#EF4444' }} />} iconBg="rgba(239,68,68,0.15)" subtitle={`Net new ${money(mv.waterfall.netNewMrr)}`} tooltip="MRR lost to cancellations and downgrades this period." />
                </div>

                {mv.cohorts.length > 0 && (
                  <Card title="Revenue Cohort" subtitle="MRR retention by acquisition month" tooltip="Percent of each cohort's starting MRR still active at later month offsets.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                            <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>Cohort</th>
                            {[0, 1, 2, 3, 6, 12].map((o) => <th key={o} className="text-right py-2 px-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>M{o}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {mv.cohorts.slice(-6).map((c) => (
                            <tr key={c.cohort} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                              <td className="py-2.5 px-2 font-medium text-white">{c.cohort}</td>
                              {[0, 1, 2, 3, 6, 12].map((o) => {
                                const pt = c.points.find((p) => p.offset === o)
                                const val = pt?.pct ?? null
                                const bg = val == null ? 'transparent' : val >= 95 ? 'rgba(16,185,129,0.15)' : val >= 90 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'
                                const fc = val == null ? 'var(--color-text-muted)' : val >= 95 ? '#10B981' : val >= 90 ? '#F59E0B' : '#EF4444'
                                return (
                                  <td key={o} className="py-2.5 px-2 text-right">
                                    {val != null ? <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: bg, color: fc }}>{val.toFixed(0)}%</span> : <span style={{ color: 'var(--color-surface-border)' }}>—</span>}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card title="MRR Movement" subtitle="New, expansion, and churned MRR" tooltip="Decomposition of MRR change. Requires at least two monthly subscription snapshots, which accrue from the day you connect.">
                <div className="flex flex-col items-center text-center gap-2 py-8">
                  <LineChart size={22} style={{ color: 'var(--color-text-muted)' }} />
                  <p className="text-sm font-medium text-white">Building your MRR movement</p>
                  <p className="text-xs max-w-md" style={{ color: 'var(--color-text-muted)' }}>
                    NRR, the new/expansion/churned waterfall, and cohort retention are computed from monthly subscription snapshots. They populate here once you have two months of history{mv && mv.periods > 0 ? ` (you have ${mv.periods} so far)` : ''}.
                  </p>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
