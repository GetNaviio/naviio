'use client'

/**
 * Navi decision answer, framed like the transactions drill-down (a right-side
 * slide-over) and organized like the deck's AI Advisor examples:
 *   Your question → Navi analysis (verdict) → the figures → what this means →
 *   key considerations → next steps / recommendation.
 * Every figure comes from the engine (answer payload); nothing is invented.
 */
import { useState } from 'react'
import { X, CheckCircle2, XCircle, AlertCircle, Check, Sparkles, Target, Download, SlidersHorizontal, Loader2 } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { DecisionAnswer, DecisionTemplate } from '@/lib/decisions/types'

const OUTCOME_LABEL: Record<string, string> = { proceeded: 'Went ahead', deferred: 'Holding off', declined: "Didn't" }

// Which params each template exposes for inline editing, and how to show them.
type EditKind = 'usd' | 'pct' | 'num'
const EDITABLE: Record<DecisionTemplate, { key: string; label: string; kind: EditKind }[]> = {
  affordability: [
    { key: 'amount', label: 'One-time amount', kind: 'usd' },
    { key: 'recurringMonthly', label: 'Recurring / mo', kind: 'usd' },
    { key: 'horizonMonths', label: 'Horizon (months)', kind: 'num' },
    { key: 'minCashFloor', label: 'Cash floor', kind: 'usd' },
  ],
  capex: [
    { key: 'price', label: 'Price', kind: 'usd' },
    { key: 'avgRevenuePerUnit', label: 'Avg revenue / unit', kind: 'usd' },
    { key: 'grossMarginPct', label: 'Gross margin %', kind: 'pct' },
    { key: 'unitsPerMonth', label: 'Units / month', kind: 'num' },
    { key: 'apr', label: 'Financing APR %', kind: 'pct' },
    { key: 'termMonths', label: 'Term (months)', kind: 'num' },
  ],
  runway_path: [
    { key: 'addedMonthlyCost', label: 'Added monthly cost', kind: 'usd' },
    { key: 'monthlyNetImprovement', label: 'Monthly improvement', kind: 'usd' },
    { key: 'horizonMonths', label: 'Horizon (months)', kind: 'num' },
  ],
}

const verdictIcon = (v: DecisionAnswer['verdict'], size = 20) =>
  v === 'yes' ? <CheckCircle2 size={size} style={{ color: '#10B981' }} />
  : v === 'no' ? <XCircle size={size} style={{ color: '#EF4444' }} />
  : <AlertCircle size={size} style={{ color: '#3B82F6' }} />

const verdictBg = (v: DecisionAnswer['verdict']) =>
  v === 'yes' ? 'rgba(16,185,129,0.10)' : v === 'no' ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.10)'
const verdictBorder = (v: DecisionAnswer['verdict']) =>
  v === 'yes' ? 'rgba(16,185,129,0.35)' : v === 'no' ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)'
const toneColor = (tone?: string) =>
  tone === 'good' ? 'var(--color-success)' : tone === 'bad' ? 'var(--color-danger)' : 'var(--color-text-primary)'

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 400, h = 64
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 64 }} aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill="#3B82F6" opacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke="#3B82F6" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>{children}</p>
}

export default function NaviDecisionDrawer({ answer, question, decisionId, params, onClose, onRecompute }: {
  answer: DecisionAnswer
  question: string
  decisionId?: string
  params?: Record<string, unknown>
  onClose: () => void
  onRecompute?: (answer: DecisionAnswer, decisionId: string | undefined, params: Record<string, unknown>) => void
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose)
  // Local state so a recompute updates the open drawer in place.
  const [ans, setAns] = useState(answer)
  const [did, setDid] = useState(decisionId)
  const [curParams, setCurParams] = useState<Record<string, unknown>>(params ?? {})
  const [recorded, setRecorded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeErr, setRecomputeErr] = useState('')

  const isRunway = ans.template === 'runway_path'
  const fields = EDITABLE[ans.template] ?? []

  function shownValue(key: string, kind: EditKind): string {
    if (edits[key] !== undefined) return edits[key]
    const v = curParams[key]
    if (typeof v !== 'number') return ''
    return kind === 'pct' ? String(Math.round(v * 1000) / 10) : String(v)
  }

  async function recordOutcome(outcome: string) {
    if (!did || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/navi/decision', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: did, outcome }),
      })
      if (res.ok) setRecorded(outcome)
    } catch { /* ignore — non-blocking */ }
    finally { setSaving(false) }
  }

  async function recompute() {
    setRecomputing(true); setRecomputeErr('')
    const next: Record<string, unknown> = { ...curParams }
    for (const f of fields) {
      const raw = edits[f.key]
      if (raw === undefined || raw.trim() === '') continue
      const n = parseFloat(raw)
      if (!Number.isFinite(n)) continue
      next[f.key] = f.kind === 'pct' ? n / 100 : n
    }
    try {
      const res = await fetch('/api/navi/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: ans.template, params: next }),
      })
      if (res.status === 402) { setRecomputeErr("You're out of credits — reload to recompute."); return }
      const data = await res.json().catch(() => ({}))
      if (data?.answer) {
        setAns(data.answer as DecisionAnswer)
        const newId = typeof data.decisionId === 'string' ? data.decisionId : undefined
        const newParams = (data.params as Record<string, unknown>) ?? next
        setDid(newId); setCurParams(newParams)
        setEdits({}); setEditOpen(false); setRecorded(null)
        onRecompute?.(data.answer as DecisionAnswer, newId, newParams)
      } else {
        setRecomputeErr('Could not recompute — check the numbers and try again.')
      }
    } catch { setRecomputeErr('Network error — please try again.') }
    finally { setRecomputing(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Navi decision analysis">
      <div className="absolute inset-0 no-print" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="navi-print relative h-full w-full max-w-2xl flex flex-col shadow-2xl outline-none"
        style={{ backgroundColor: 'var(--color-surface-card)', borderLeft: '1px solid var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}>
              <Sparkles size={14} style={{ color: '#3B82F6' }} />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none" style={{ color: 'var(--color-text-primary)' }}>Navi</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Decision analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>AI Advisor</span>
            <button onClick={onClose} aria-label="Close" className="no-print p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Your question */}
          {question && (
            <div>
              <SectionLabel>Your question</SectionLabel>
              <p className="text-sm rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-primary)' }}>{question}</p>
            </div>
          )}

          {/* Navi analysis (verdict) */}
          <div>
            <SectionLabel>Navi analysis</SectionLabel>
            <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ backgroundColor: verdictBg(ans.verdict), border: `1px solid ${verdictBorder(ans.verdict)}` }}>
              {verdictIcon(ans.verdict)}
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{ans.headline}</p>
            </div>
          </div>

          {/* Figures */}
          {ans.stats.length > 0 && (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {ans.stats.map((s) => (
                <div key={s.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px solid var(--color-surface-border)' }}>
                  <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="text-lg font-bold mt-1 truncate" style={{ color: toneColor(s.tone) }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* What this means */}
          <div>
            <SectionLabel>{isRunway ? 'What drives this' : 'What this means for you'}</SectionLabel>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{ans.summary}</p>
            {ans.assumptions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {ans.assumptions.map((a) => (
                  <span key={a.key} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {a.label}: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{typeof a.value === 'number' && a.unit === 'usd' ? a.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : a.value}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Adjust assumptions → recompute. The user can correct a wrong input
                (e.g. an overstated number the extractor merged) and re-run the
                engine in place; the math is still 100% deterministic server-side. */}
            {fields.length > 0 && (
              <div className="mt-3 no-print">
                <button
                  onClick={() => setEditOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: '#3B82F6' }}
                >
                  <SlidersHorizontal size={13} /> {editOpen ? 'Hide inputs' : 'Adjust assumptions'}
                </button>
                {editOpen && (
                  <div className="mt-2.5 rounded-xl p-3 space-y-2.5" style={{ border: '1px dashed var(--color-surface-border)', backgroundColor: 'var(--color-surface-card-hover)' }}>
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      {fields.map((f) => (
                        <label key={f.key} className="block">
                          <span className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>{f.label}</span>
                          <input
                            value={shownValue(f.key, f.kind)}
                            onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                            inputMode="decimal"
                            placeholder={f.kind === 'pct' ? '%' : f.kind === 'usd' ? '$' : '#'}
                            className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
                          />
                        </label>
                      ))}
                    </div>
                    {recomputeErr && <p className="text-xs" style={{ color: '#F87171' }}>{recomputeErr}</p>}
                    <button
                      onClick={recompute}
                      disabled={recomputing}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#2F6BFF,#1E5BE6)' }}
                    >
                      {recomputing ? <Loader2 size={14} className="animate-spin" /> : null} Recompute (1 credit)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Projection */}
          {ans.series && ans.series.length > 1 && (
            <div>
              <SectionLabel>Projection</SectionLabel>
              <Sparkline data={ans.series.map((p) => p.value)} />
            </div>
          )}

          {/* Key considerations */}
          {ans.considerations.length > 0 && (
            <div>
              <SectionLabel>Key considerations</SectionLabel>
              <ul className="space-y-1.5">
                {ans.considerations.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps / recommendation */}
          {ans.nextSteps.length > 0 && (
            <div className="rounded-xl p-3.5" style={{ backgroundColor: 'rgba(0,196,159,0.06)', border: '1px solid rgba(0,196,159,0.25)' }}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#00C49F' }}>
                <Target size={12} /> {isRunway ? 'Recommendation' : 'Next steps'}
              </p>
              <ul className="space-y-1">
                {ans.nextSteps.map((s, i) => <li key={i} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t text-xs space-y-2" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
          {/* Outcome capture — closes the predicted-vs-actual loop. */}
          {did && (
            recorded ? (
              <p className="flex items-center gap-1.5 no-print" style={{ color: '#10B981' }}>
                <Check size={12} /> Marked: {OUTCOME_LABEL[recorded] ?? recorded}. Navi will learn from it.
              </p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap no-print">
                <span style={{ color: 'var(--color-text-secondary)' }}>Did you act on this?</span>
                {(['proceeded', 'deferred', 'declined'] as const).map((o) => (
                  <button key={o} onClick={() => recordOutcome(o)} disabled={saving}
                    className="px-2 py-1 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
            )
          )}
          {isRunway && (
            <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg mb-1.5" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
              <Download size={13} /> Export for board
            </button>
          )}
          <p>{ans.provenance} · Confidence: {ans.confidence}.</p>
          <p>{ans.disclaimer}</p>
        </div>
      </div>

      <style>{`@media print {
        body * { visibility: hidden !important; }
        .navi-print, .navi-print * { visibility: visible !important; }
        .navi-print { position: absolute; left: 0; top: 0; width: 100%; max-width: 100% !important; height: auto !important; box-shadow: none !important; border: none !important; }
        .no-print { display: none !important; }
      }`}</style>
    </div>
  )
}
