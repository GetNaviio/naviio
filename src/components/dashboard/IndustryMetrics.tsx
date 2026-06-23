'use client'

import { useEffect, useState } from 'react'
import MetricCard from '@/components/ui/MetricCard'
import { BarChart3, Lock } from 'lucide-react'
import { selectMetrics, type MetricContext, type SelectedMetrics } from '@/lib/metrics/registry'
import { industryLabel, type Industry } from '@/lib/metrics/industry'

const catAmount = (cats: { category: string; amount: number }[] | undefined, label: string): number =>
  cats?.find((c) => c.category === label)?.amount ?? 0

/**
 * Industry-specific metric pack. Shows only the metrics that fit the org's
 * business type AND are computable from current data; lists the rest as
 * "connect X to unlock". Renders nothing for a generic/unset business type.
 */
export default function IndustryMetrics() {
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [sel, setSel] = useState<SelectedMetrics | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/stripe/metrics').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([mx, sm]) => {
      if (!alive) return
      const ind = (mx?.industry as Industry | null) ?? null
      setIndustry(ind)
      if (!ind || ind === 'generic' || !mx?.incomeStatement) return
      const is = mx.incomeStatement
      const stripe = sm?.source === 'stripe' && sm.metrics ? sm.metrics : null
      const marketing = mx?.marketing?.thisMonth ?? 0
      const newCust = stripe?.customers?.newThisMonth ?? 0
      const ctx: MetricContext = {
        revenue: is.totalIncome ?? 0,
        cogs: is.cogs ?? 0,
        grossProfit: is.grossProfit ?? 0,
        grossMargin: is.grossMargin ?? null,
        netMargin: is.netMargin ?? null,
        payroll: catAmount(is.expensesByCategory, 'Payroll & Contractors'),
        adSpend: catAmount(is.expensesByCategory, 'Advertising & Marketing'),
        refundRate: stripe?.refundRate ?? null,
        customers: stripe?.customers?.total ?? null,
        cac: marketing > 0 && newCust > 0 ? marketing / newCust : null,
        orders: null, // unlocked by a store/POS feed
      }
      setSel(selectMetrics(ind, ctx))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!industry || industry === 'generic' || !sel) return null
  if (sel.visible.length === 0 && sel.locked.length === 0) return null

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} style={{ color: '#3B82F6' }} />
        <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{industryLabel(industry)} metrics</h3>
      </div>

      {sel.visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sel.visible.map(({ def, value }) => (
            <MetricCard
              key={def.id}
              title={def.label}
              value={def.format(value)}
              subtitle={def.benchmark}
              icon={<BarChart3 size={16} style={{ color: '#3B82F6' }} />}
              iconBg="rgba(59,130,246,0.15)"
              tooltip={def.tooltip}
            />
          ))}
        </div>
      )}

      {sel.locked.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Unlock with more data</p>
          <div className="space-y-1.5">
            {sel.locked.map((def) => (
              <div key={def.id} className="flex items-center gap-2 text-sm">
                <Lock size={13} style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ color: 'var(--color-text-secondary)' }}>{def.label}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>{def.unlock ?? 'Needs more data'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
