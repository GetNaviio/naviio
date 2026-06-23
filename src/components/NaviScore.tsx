'use client'

import { useState, useEffect } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, PolarRadiusAxis } from 'recharts'
import InfoTip from '@/components/ui/InfoTip'
import {
  scoreProfitability, scoreRevenueGrowth, scoreGrossMargin, scoreRetention,
  scoreEfficiency, scoreLiquidity, overallScore, grade, scoreColor,
  GROSS_MARGIN_TARGET, NET_MARGIN_TARGET, REVENUE_GROWTH_TARGET, MONTHS_OF_CASH_TARGET,
} from '@/lib/metrics/scoring'
import type { Industry } from '@/lib/metrics/industry'

interface Dim { key: string; score: number | null; value: string; benchmark: string; weight: number; tip: string }

// Module-level so it isn't recreated each render; recharts clones it with x/y/payload.
function CustomTick({ x, y, payload, scores }: { x?: number; y?: number; payload?: { value?: string }; scores?: Record<string, number | null> }) {
  if (x == null || y == null || !payload?.value) return null
  const sc = scores?.[payload.value] ?? null
  return (
    <g>
      <text x={x} y={y - 5} textAnchor="middle" fill="#94A3B8" fontSize={12} fontWeight={500}>{payload.value}</text>
      <text x={x} y={y + 11} textAnchor="middle" fill={sc == null ? '#64748B' : scoreColor(sc)} fontSize={13} fontWeight={700}>{sc == null ? '—' : sc}</text>
    </g>
  )
}

export default function NaviScore() {
  const [dims, setDims] = useState<Dim[] | null>(null)
  const [overall, setOverall] = useState<number | null>(null)
  const [reconnect, setReconnect] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/stripe/metrics').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/revenue/movement').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/integrations/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([mx, , move, status]) => {
      if (!alive) return
      // A connected provider whose token can't be read is flagged status:ERROR →
      // surfaced here so the card prompts a reconnect rather than vanishing.
      setReconnect(Object.values(status?.reconnect ?? {}).some(Boolean))
      const wf = move?.waterfall ?? null

      const is = mx?.incomeStatement
      const netMargin = is?.netMargin ?? null
      // Growth ← month-over-month REVENUE growth (universal), from the income
      // statement's monthly series, excluding the partial current month.
      const months: { income: number }[] = is?.byMonth ?? []
      const complete = months.length > 1 ? months.slice(0, -1) : months
      const lm = complete[complete.length - 1], pm = complete[complete.length - 2]
      const revGrowth = lm && pm && pm.income > 0 ? ((lm.income - pm.income) / pm.income) * 100 : null
      // Unit economics (universal) ← gross margin, only when a real COGS split exists.
      const grossMargin = (is?.cogs ?? 0) > 0 ? is?.grossMargin ?? null : null

      const nrr = move?.nrr ?? null
      const marketing = mx?.marketing?.thisMonth ?? 0
      const magic = wf && marketing > 0 ? (wf.netNewMrr * 12) / marketing : null
      const burn = mx?.cashFlow?.burnRate ?? 0
      const cashPresent = mx?.cash?.balance != null
      const runway = mx?.runwayMonths != null ? mx.runwayMonths : (cashPresent && burn <= 0 ? Infinity : null)

      // SaaS-only dimensions (Retention, Efficiency) apply when the business is
      // SaaS — explicitly, or implicitly when recurring-revenue snapshots exist
      // and no other industry was chosen. A restaurant never sees an empty NRR axis.
      const industry = (mx?.industry as Industry | null) ?? null
      const showSaas = industry === 'saas' || (industry == null && wf != null)
      const nmTarget = NET_MARGIN_TARGET[industry ?? 'generic']
      const gmTarget = GROSS_MARGIN_TARGET[industry ?? 'generic']
      const rgTarget = REVENUE_GROWTH_TARGET[industry ?? 'generic']
      const cashTarget = MONTHS_OF_CASH_TARGET[industry ?? 'generic']

      const pct = (v: number | null, suffix: string) => (v == null ? '—' : `${v.toFixed(1)}${suffix}`)
      const built: Dim[] = [
        { key: 'Profitability', score: scoreProfitability(netMargin, industry), value: pct(netMargin, '% margin'), benchmark: `Target ≥ ${nmTarget}% net`, weight: 0.25, tip: `Net income ÷ revenue, graded against the ~${nmTarget}% target for your industry.` },
        { key: 'Growth', score: scoreRevenueGrowth(revGrowth, industry), value: revGrowth == null ? '—' : `${revGrowth.toFixed(1)}% MoM`, benchmark: `Target ≥ ${rgTarget}% MoM`, weight: 0.25, tip: `Month-over-month revenue growth, graded against the ~${rgTarget}%/mo target for your industry.` },
        ...(grossMargin != null
          ? [{ key: 'Gross Margin', score: scoreGrossMargin(grossMargin, industry), value: `${grossMargin.toFixed(0)}%`, benchmark: `Target ≥ ${gmTarget}%`, weight: 0.2, tip: `Gross profit ÷ revenue, graded against the ~${gmTarget}% target for your industry.` }]
          : []),
        { key: 'Liquidity', score: scoreLiquidity(runway, industry), value: runway == null ? '—' : runway === Infinity ? 'Cash positive' : `${runway}mo`, benchmark: `Target ≥ ${cashTarget}mo`, weight: 0.15, tip: `Months of cash at current burn, graded against the ~${cashTarget}-month target for your industry.` },
        ...(showSaas
          ? [
              { key: 'Retention', score: scoreRetention(nrr), value: pct(nrr, '% NRR'), benchmark: 'Net Revenue Retention', weight: 0.1, tip: 'Net Revenue Retention from MRR snapshots.' },
              { key: 'Efficiency', score: scoreEfficiency(magic), value: magic == null ? '—' : `${magic.toFixed(2)}x`, benchmark: 'Magic Number', weight: 0.05, tip: 'Net-new ARR per $ of ad spend.' },
            ]
          : []),
      ]
      setDims(built)
      setOverall(overallScore(built.map((d) => ({ score: d.score, weight: d.weight }))))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!dims) return null
  const available = dims.filter((d) => d.score != null)
  if (available.length === 0) {
    // No dimensions have data. If that's because a connected account needs
    // re-authentication, say so and offer a reconnect — don't disappear.
    if (!reconnect) return null
    return (
      <div className="rounded-xl p-6 flex items-center justify-between gap-4" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
        <div>
          <h3 className="text-base font-semibold text-white">Navi Score</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            We can&apos;t read one of your connected accounts right now. Reconnect it to refresh your score.
          </p>
        </div>
        <a href="/integrations" className="flex-shrink-0 text-sm font-medium px-4 py-2 rounded-lg" style={{ backgroundColor: '#3B82F6', color: '#fff' }}>
          Reconnect
        </a>
      </div>
    )
  }

  const radarData = dims.map((d) => ({ dimension: d.key, score: d.score ?? 0 }))
  const scoreMap = Object.fromEntries(dims.map((d) => [d.key, d.score]))
  const g = overall != null ? grade(overall) : null

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            Navi Score
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>Financial Health Score</span>
            <InfoTip text="A composite score across the financial dimensions that fit your business, each scored 0–100 from your live data. Dimensions without data yet are shown as 'needs data'; SaaS-only dimensions appear only for subscription businesses." />
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{available.length} of {dims.length} dimensions scored from live data</p>
        </div>
        {g && (
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Overall Score</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-white">{overall}</span>
              <span className="text-xl font-bold" style={{ color: g.color }}>{g.grade}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        <div className="lg:col-span-3 px-4 pt-4 pb-2">
          <div style={{ width: '100%', height: 340 }}>
            {mounted && (
              <ResponsiveContainer width="100%" height={340}>
                <RadarChart data={radarData} margin={{ top: 14, right: 28, bottom: 14, left: 28 }}>
                  <PolarGrid gridType="polygon" stroke="var(--color-surface-border)" strokeWidth={1} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
                  <PolarAngleAxis dataKey="dimension" tick={<CustomTick scores={scoreMap} />} tickLine={false} axisLine={{ stroke: 'var(--color-surface-border)' }} />
                  <Radar name="Score" dataKey="score" stroke="#3B82F6" strokeWidth={2} fill="#3B82F6" fillOpacity={0.15} dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 border-l px-5 py-5 space-y-4" style={{ borderColor: 'var(--color-surface-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Dimension Scores</p>
          {dims.map((d) => {
            const col = d.score == null ? 'var(--color-text-muted)' : scoreColor(d.score)
            return (
              <div key={d.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white">{d.key}<InfoTip text={d.tip} /></span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{d.value}</span>
                    <span className="text-sm font-bold w-8 text-right" style={{ color: col }}>{d.score ?? '—'}</span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${d.score ?? 0}%`, backgroundColor: col }} />
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: d.score == null ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>{d.score == null ? 'Needs data' : d.benchmark}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
