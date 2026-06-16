'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import ConnectPrompt from '@/components/ConnectPrompt'
import { formatCurrency } from '@/lib/utils'
import { Calculator, Building2, AlertTriangle, Receipt, Lock } from 'lucide-react'

interface Metrics {
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: { netIncome: number }
}

// Illustrative blended effective-rate defaults per entity type. The user can
// override — this is an estimate, not tax advice.
const ENTITY = [
  { id: 'sole', label: 'Sole Prop / LLC', rate: 0.30 },
  { id: 'scorp', label: 'S-Corp', rate: 0.27 },
  { id: 'ccorp', label: 'C-Corp', rate: 0.21 },
] as const

const monthsElapsed = () => new Date().getUTCMonth() + 1

export default function CPAPage() {
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [entity, setEntity] = useState<typeof ENTITY[number]['id']>('scorp')
  const [rate, setRate] = useState(0.27)

  useEffect(() => {
    let alive = true
    fetch('/api/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setM(d); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const ytdNet = m?.incomeStatement?.netIncome ?? 0
  const annualizedNet = useMemo(() => (ytdNet / monthsElapsed()) * 12, [ytdNet])
  const taxableNet = Math.max(annualizedNet, 0)
  const estLiability = taxableNet * rate
  const quarterly = estLiability / 4
  const anyConnected = !!(m?.sources && (m.sources.plaid || m.sources.stripe || m.sources.quickbooks || m.sources.xero))
  const hasNet = !!m && ytdNet !== 0

  function pickEntity(id: typeof ENTITY[number]['id']) {
    setEntity(id)
    setRate(ENTITY.find((e) => e.id === id)!.rate)
  }

  return (
    <div>
      <Header title="CPA / Tax" subtitle="Estimated tax liability from your live net income" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="rounded-xl h-28 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}
          </div>
        ) : !anyConnected || !hasNet ? (
          <ConnectPrompt
            icon={<Calculator size={20} />}
            title="Connect a data source to estimate taxes"
            message="Tax estimates are calculated from your live net income. Connect your bank, Stripe, or accounting so we have a profit figure to work from."
            cta="Connect an integration"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {ENTITY.map((e) => (
                <button
                  key={e.id}
                  onClick={() => pickEntity(e.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ backgroundColor: entity === e.id ? '#3B82F6' : 'var(--color-surface-card-hover)', color: entity === e.id ? 'white' : 'var(--color-text-secondary)' }}
                >
                  <Building2 size={12} /> {e.label}
                </button>
              ))}
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Effective rate</span>
                <input type="range" min={0} max={50} value={Math.round(rate * 100)} onChange={(e) => setRate(Number(e.target.value) / 100)} className="flex-1 sm:flex-none sm:w-32" aria-label="Effective tax rate" />
                <span className="text-sm font-semibold text-white w-10 flex-shrink-0">{Math.round(rate * 100)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard title="Annualized Net Income" value={formatCurrency(annualizedNet, true)} icon={<Receipt size={16} style={{ color: '#3B82F6' }} />} iconBg="rgba(59,130,246,0.15)" subtitle={`From ${formatCurrency(ytdNet, true)} YTD`} tooltip="Year-to-date net income projected to a full year (YTD net ÷ months elapsed × 12)." />
              <MetricCard title="Estimated Tax Liability" value={formatCurrency(estLiability, true)} icon={<Calculator size={16} style={{ color: '#F59E0B' }} />} iconBg="rgba(245,158,11,0.15)" subtitle={`${Math.round(rate * 100)}% effective rate`} tooltip="Annualized taxable net income × the effective rate you selected. An estimate only." />
              <MetricCard title="Quarterly Estimate" value={formatCurrency(quarterly, true)} icon={<Receipt size={16} style={{ color: '#8B5CF6' }} />} iconBg="rgba(139,92,246,0.15)" subtitle="Per quarter" tooltip="Estimated liability split across four quarterly payments." />
            </div>

            <div className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: 2 }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                This is a rough estimate from your <strong>cash-basis</strong> year-to-date net income, annualized — so it will be lumpy if your billing is seasonal or annual (a year paid up front lands in one month). It does not account for deductions, credits, payroll vs. distributions, state specifics, deferred revenue, or payments already made. It is <strong>not tax advice</strong>. Consult a licensed CPA before filing or making payments.
              </p>
            </div>

            <Card title="Coming with the tax engine" subtitle="Built on your real data — no demo figures shown" tooltip="These need a tax-rules engine plus entity and payment details you'll enter. They'll compute from your real numbers.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                {['Deduction finder', 'Entity comparison (LLC vs S-Corp vs C-Corp)', 'Quarterly payment tracker', 'AI tax-saving suggestions'].map((f) => (
                  <div key={f} className="flex items-center gap-2 py-2.5 border-b text-sm" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    <Lock size={12} style={{ color: 'var(--color-text-muted)' }} /> {f}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
