'use client'

import { useEffect, useState } from 'react'
import { INDUSTRIES, industryLabel, type Industry } from '@/lib/metrics/industry'
import { Check, Sparkles } from 'lucide-react'

/**
 * Business type picker. The chosen industry decides which metrics Naviio shows
 * (the metric registry gates on it) and which Navi-score dimensions/benchmarks
 * apply. We pre-fill an inferred suggestion from the transaction mix.
 */
export default function BusinessTypeSection() {
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [suggestion, setSuggestion] = useState<Industry | null>(null)
  const [saving, setSaving] = useState<Industry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!alive) return
        setIndustry((m?.industry as Industry | null) ?? null)
        setSuggestion((m?.industrySuggestion as Industry | null) ?? null)
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  async function choose(id: Industry) {
    setSaving(id)
    try {
      const res = await fetch('/api/org/industry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: id }),
      })
      if (res.ok) { setIndustry(id); setSuggestion(null) }
    } finally {
      setSaving(null)
    }
  }

  const card = { backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }

  return (
    <div className="rounded-xl p-5" style={card}>
      <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Business type</h3>
      <p className="text-sm mt-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Naviio tailors your metrics and Navi Score to your industry — a restaurant sees prime cost and food margin, a SaaS company sees MRR and NRR. Universal metrics (revenue, gross margin, cash) always show.
      </p>

      {!loading && !industry && suggestion && (
        <div className="flex items-center gap-2 text-sm mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--color-text-secondary)' }}>
          <Sparkles size={15} style={{ color: '#3B82F6' }} />
          <span>From your transactions, this looks like a <strong style={{ color: 'var(--color-text-primary)' }}>{industryLabel(suggestion)}</strong> business.</span>
          <button onClick={() => choose(suggestion)} className="ml-auto text-xs font-medium px-2.5 py-1 rounded-md text-white" style={{ backgroundColor: '#3B82F6' }}>Use this</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {INDUSTRIES.map((opt) => {
          const selected = industry === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => choose(opt.id)}
              disabled={saving != null}
              className="flex items-start gap-3 text-left px-3 py-2.5 rounded-lg transition-colors"
              style={{
                border: `1px solid ${selected ? '#3B82F6' : 'var(--color-surface-border)'}`,
                backgroundColor: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
                opacity: saving != null && saving !== opt.id ? 0.5 : 1,
              }}
            >
              <div className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${selected ? '#3B82F6' : 'var(--color-surface-border)'}`, backgroundColor: selected ? '#3B82F6' : 'transparent' }}>
                {selected && <Check size={11} color="#fff" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{opt.label}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{opt.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
