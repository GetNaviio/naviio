'use client'

/**
 * Renders a Navi decision answer (the universal answer contract) in the deck's
 * "AI Advisor" style: verdict → the math → assumptions → considerations →
 * next steps, with provenance and the not-advice line. Every figure shown comes
 * straight from the engine via the answer payload.
 */
import { CheckCircle2, XCircle, AlertCircle, Sparkles, Check, Download } from 'lucide-react'
import type { DecisionAnswer } from '@/lib/decisions/types'

function VerdictIcon({ verdict }: { verdict: DecisionAnswer['verdict'] }) {
  if (verdict === 'yes') return <CheckCircle2 size={22} style={{ color: '#10B981' }} />
  if (verdict === 'no') return <XCircle size={22} style={{ color: '#EF4444' }} />
  return <AlertCircle size={22} style={{ color: '#3B82F6' }} />
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 320, h = 56
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 56 }} aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill="#3B82F6" opacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke="#3B82F6" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

const toneColor = (tone?: string) =>
  tone === 'good' ? 'var(--color-success)' : tone === 'bad' ? 'var(--color-danger)' : 'var(--color-text-primary)'

const verdictBg = (v: DecisionAnswer['verdict']) =>
  v === 'yes' ? 'rgba(16,185,129,0.10)' : v === 'no' ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.10)'
const verdictBorder = (v: DecisionAnswer['verdict']) =>
  v === 'yes' ? 'rgba(16,185,129,0.35)' : v === 'no' ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)'

export default function NaviDecisionCard({ answer, onExport }: { answer: DecisionAnswer; onExport?: () => void }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          <Sparkles size={16} style={{ color: '#3B82F6' }} /> Navi
        </div>
        <div className="flex items-center gap-2">
          {onExport && (
            <button onClick={onExport} className="no-print flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors" style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
              <Download size={13} /> Export for board
            </button>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>AI Advisor</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Verdict */}
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ backgroundColor: verdictBg(answer.verdict), border: `1px solid ${verdictBorder(answer.verdict)}` }}>
          <VerdictIcon verdict={answer.verdict} />
          <div>
            <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{answer.headline}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{answer.summary}</p>
          </div>
        </div>

        {/* Stats */}
        {answer.stats.length > 0 && (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(answer.stats.length, 4)}, minmax(0,1fr))` }}>
            {answer.stats.map((s) => (
              <div key={s.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px solid var(--color-surface-border)' }}>
                <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                <p className="text-base font-semibold mt-1 truncate" style={{ color: toneColor(s.tone) }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Projection sparkline */}
        {answer.series && answer.series.length > 1 && <Sparkline data={answer.series.map((p) => p.value)} />}

        {/* Assumptions */}
        {answer.assumptions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Assumptions</p>
            <div className="flex flex-wrap gap-2">
              {answer.assumptions.map((a) => (
                <span key={a.key} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  {a.label}: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{typeof a.value === 'number' && a.unit === 'usd' ? a.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : a.value}</span>
                  <span className="ml-1 opacity-60">({a.source})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Considerations */}
        {answer.considerations.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Key considerations</p>
            <ul className="space-y-1.5">
              {answer.considerations.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />{c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next steps */}
        {answer.nextSteps.length > 0 && (
          <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(0,196,159,0.06)', border: '1px solid rgba(0,196,159,0.25)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#00C49F' }}>Next steps</p>
            <ul className="space-y-1">
              {answer.nextSteps.map((s, i) => (
                <li key={i} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer: provenance + confidence + disclaimer */}
        <div className="pt-2 border-t text-xs space-y-1" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
          <p>{answer.provenance} · Confidence: {answer.confidence}.</p>
          <p>{answer.disclaimer}</p>
        </div>
      </div>
    </div>
  )
}
