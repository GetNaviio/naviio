'use client'

/**
 * Navi — Ask a Decision (V1). A structured way to ask the three flagship
 * decision questions (affordability, investment ROI, runway path); the answer
 * is computed by the deterministic engine and rendered as a decision card.
 * Natural-language routing into these templates is the V2 layer.
 */
import { useState } from 'react'
import Header from '@/components/layout/Header'
import NaviDecisionCard from '@/components/navi/NaviDecisionCard'
import { Loader2, Wallet, Boxes, Compass } from 'lucide-react'
import type { DecisionAnswer } from '@/lib/decisions/types'

type Template = 'affordability' | 'capex' | 'runway_path'

const TABS: { id: Template; label: string; icon: typeof Wallet; blurb: string }[] = [
  { id: 'affordability', label: 'Can I afford it?', icon: Wallet, blurb: 'A lease, a hire, any new cost — without breaking cash.' },
  { id: 'capex', label: 'Is it a good buy?', icon: Boxes, blurb: 'Equipment / financing — payback, break-even, ROI.' },
  { id: 'runway_path', label: 'Runway & path', icon: Compass, blurb: 'Runway, hiring, and the path to profitability.' },
]

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none'
const inputStyle = { backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' } as const

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}{hint && <span className="ml-1 opacity-60">{hint}</span>}</span>
      {children}
    </label>
  )
}

export default function NaviPage() {
  const [template, setTemplate] = useState<Template>('affordability')
  const [f, setF] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState<DecisionAnswer | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((prev) => ({ ...prev, [k]: e.target.value }))
  const numv = (k: string): number | undefined => { const n = parseFloat(f[k]); return Number.isFinite(n) ? n : undefined }

  function buildParams(): Record<string, unknown> {
    if (template === 'affordability') {
      return { amount: numv('amount') ?? 0, recurringMonthly: numv('recurringMonthly'), horizonMonths: numv('horizonMonths') ?? 3, minCashFloor: numv('minCashFloor'), label: f.label || undefined }
    }
    if (template === 'capex') {
      const apr = numv('apr'); const gm = numv('grossMarginPct')
      return {
        price: numv('price') ?? 0, downPayment: numv('downPayment'),
        apr: apr != null ? apr / 100 : undefined, termMonths: numv('termMonths'),
        avgRevenuePerUnit: numv('avgRevenuePerUnit') ?? 0, grossMarginPct: gm != null ? gm / 100 : 0,
        unitsPerMonth: numv('unitsPerMonth') ?? 0, label: f.label || undefined,
      }
    }
    return { addedMonthlyCost: numv('addedMonthlyCost'), monthlyNetImprovement: numv('monthlyNetImprovement'), horizonMonths: numv('horizonMonths') ?? 24 }
  }

  async function ask() {
    setLoading(true); setError(''); setAnswer(null)
    try {
      const res = await fetch('/api/navi/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, params: buildParams() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 402) { setError(data.error || "You're out of credits."); return }
      if (!res.ok || !data.answer) { setError(data.error || 'Could not compute this decision.'); return }
      setAnswer(data.answer as DecisionAnswer)
    } catch { setError('Network error — please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <Header title="Navi" subtitle="Ask a decision — answered from your live numbers" />

      <div className="p-4 sm:p-6 max-w-3xl space-y-5">
        {/* Template selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {TABS.map(({ id, label, icon: Icon, blurb }) => {
            const active = template === id
            return (
              <button key={id} onClick={() => { setTemplate(id); setAnswer(null); setError('') }}
                className="text-left rounded-xl p-3 transition-colors"
                style={{ backgroundColor: active ? 'rgba(59,130,246,0.12)' : 'var(--color-surface-card)', border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : 'var(--color-surface-border)'}` }}>
                <Icon size={16} style={{ color: active ? '#3B82F6' : 'var(--color-text-muted)' }} />
                <p className="text-sm font-semibold mt-1.5" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{blurb}</p>
              </button>
            )
          })}
        </div>

        {/* Form */}
        <div className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
          {template === 'affordability' && (
            <>
              <Field label="What are you considering?"><input className={inputCls} style={inputStyle} placeholder="the retail lease" value={f.label ?? ''} onChange={set('label')} /></Field>
              <Field label="One-time amount" hint="$"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="240000" value={f.amount ?? ''} onChange={set('amount')} /></Field>
              <Field label="Recurring / month" hint="$ optional"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="0" value={f.recurringMonthly ?? ''} onChange={set('recurringMonthly')} /></Field>
              <Field label="Horizon" hint="months"><input className={inputCls} style={inputStyle} inputMode="numeric" placeholder="3" value={f.horizonMonths ?? ''} onChange={set('horizonMonths')} /></Field>
              <Field label="Minimum cash floor" hint="$ optional — defaults to 3× burn"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="500000" value={f.minCashFloor ?? ''} onChange={set('minCashFloor')} /></Field>
            </>
          )}
          {template === 'capex' && (
            <>
              <Field label="What are you buying?"><input className={inputCls} style={inputStyle} placeholder="the laser machine" value={f.label ?? ''} onChange={set('label')} /></Field>
              <Field label="Price" hint="$"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="180000" value={f.price ?? ''} onChange={set('price')} /></Field>
              <Field label="Avg revenue / unit" hint="$"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="2000" value={f.avgRevenuePerUnit ?? ''} onChange={set('avgRevenuePerUnit')} /></Field>
              <Field label="Gross margin" hint="%"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="68" value={f.grossMarginPct ?? ''} onChange={set('grossMarginPct')} /></Field>
              <Field label="Units / month"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="15" value={f.unitsPerMonth ?? ''} onChange={set('unitsPerMonth')} /></Field>
              <Field label="Financing APR" hint="% optional"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="8" value={f.apr ?? ''} onChange={set('apr')} /></Field>
              <Field label="Term" hint="months optional"><input className={inputCls} style={inputStyle} inputMode="numeric" placeholder="36" value={f.termMonths ?? ''} onChange={set('termMonths')} /></Field>
            </>
          )}
          {template === 'runway_path' && (
            <>
              <Field label="Added monthly cost" hint="$ optional — e.g. new hires"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="50000" value={f.addedMonthlyCost ?? ''} onChange={set('addedMonthlyCost')} /></Field>
              <Field label="Monthly net improvement" hint="$ optional — growth"><input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="10000" value={f.monthlyNetImprovement ?? ''} onChange={set('monthlyNetImprovement')} /></Field>
              <Field label="Horizon" hint="months"><input className={inputCls} style={inputStyle} inputMode="numeric" placeholder="24" value={f.horizonMonths ?? ''} onChange={set('horizonMonths')} /></Field>
            </>
          )}

          <div className="sm:col-span-2 flex items-center gap-3 pt-1">
            <button onClick={ask} disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#2F6BFF,#1E5BE6)' }}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : null} Ask Navi
            </button>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uses 1 credit · answered from your live data</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.10)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>{error}</div>
        )}

        {answer && <NaviDecisionCard answer={answer} />}
      </div>
    </div>
  )
}
