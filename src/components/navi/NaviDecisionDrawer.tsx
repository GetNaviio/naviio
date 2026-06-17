'use client'

/**
 * Navi decision answer, framed like the transactions drill-down (a right-side
 * slide-over) and organized like the deck's AI Advisor examples:
 *   Your question → Navi analysis (verdict) → the figures → what this means →
 *   key considerations → next steps / recommendation.
 * Every figure comes from the engine (answer payload); nothing is invented.
 */
import { X, CheckCircle2, XCircle, AlertCircle, Check, Sparkles, Target, Download } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { DecisionAnswer } from '@/lib/decisions/types'

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

export default function NaviDecisionDrawer({ answer, question, onClose }: { answer: DecisionAnswer; question: string; onClose: () => void }) {
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose)
  const isRunway = answer.template === 'runway_path'

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Navi decision analysis">
      <div className="absolute inset-0 no-print" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="navi-print relative h-full w-full max-w-md flex flex-col shadow-2xl outline-none"
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
            <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ backgroundColor: verdictBg(answer.verdict), border: `1px solid ${verdictBorder(answer.verdict)}` }}>
              {verdictIcon(answer.verdict)}
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{answer.headline}</p>
            </div>
          </div>

          {/* Figures */}
          {answer.stats.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {answer.stats.map((s) => (
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
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{answer.summary}</p>
            {answer.assumptions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {answer.assumptions.map((a) => (
                  <span key={a.key} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {a.label}: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{typeof a.value === 'number' && a.unit === 'usd' ? a.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : a.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Projection */}
          {answer.series && answer.series.length > 1 && (
            <div>
              <SectionLabel>Projection</SectionLabel>
              <Sparkline data={answer.series.map((p) => p.value)} />
            </div>
          )}

          {/* Key considerations */}
          {answer.considerations.length > 0 && (
            <div>
              <SectionLabel>Key considerations</SectionLabel>
              <ul className="space-y-1.5">
                {answer.considerations.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps / recommendation */}
          {answer.nextSteps.length > 0 && (
            <div className="rounded-xl p-3.5" style={{ backgroundColor: 'rgba(0,196,159,0.06)', border: '1px solid rgba(0,196,159,0.25)' }}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#00C49F' }}>
                <Target size={12} /> {isRunway ? 'Recommendation' : 'Next steps'}
              </p>
              <ul className="space-y-1">
                {answer.nextSteps.map((s, i) => <li key={i} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t text-xs space-y-1" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
          {isRunway && (
            <button onClick={() => window.print()} className="no-print flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg mb-1.5" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
              <Download size={13} /> Export for board
            </button>
          )}
          <p>{answer.provenance} · Confidence: {answer.confidence}.</p>
          <p>{answer.disclaimer}</p>
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
