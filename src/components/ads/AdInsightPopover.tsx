'use client'

/**
 * The ad-spend validation popover: hover (desktop) or click (touch) the
 * Meta/Google chip on an ad transaction → see the billing window the charge
 * covers, whether platform-reported spend reconciles with the bank, and the
 * KPIs that money bought. Lazy-fetched on first open, cached after.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { AdPlatform } from '@/lib/ads/match'

interface InsightPayload {
  platform: AdPlatform | null
  connected?: boolean
  charge?: { amount: number; date: string }
  match?: {
    matched: boolean
    basis: 'billing-window' | 'recent-30d'
    from: string | null
    to: string | null
    days: number
    platformSpend: number
    delta: number
    accountName: string | null
  }
  totals?: { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number | null }
  kpis?: { ctr: number | null; cpc: number | null; cpm: number | null; cpa: number | null; roas: number | null }
}

export const PLATFORM_META: Record<AdPlatform, { label: string; color: string; bg: string }> = {
  META_ADS: { label: 'Meta', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  GOOGLE_ADS: { label: 'Google Ads', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
}

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtInt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))

export default function AdInsightPopover({ txnId, platform }: { txnId: string; platform: AdPlatform }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<InsightPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const fetched = useRef(false)
  const ref = useRef<HTMLSpanElement>(null)
  const p = PLATFORM_META[platform]

  // Fetch once, on first open.
  useEffect(() => {
    if (!open || fetched.current) return
    fetched.current = true
    fetch(`/api/ads/insights?txnId=${encodeURIComponent(txnId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true))
  }, [open, txnId])

  // Click-away close (touch devices have no mouseleave).
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const kpiCell = (label: string, value: string) => (
    <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  )

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80"
        style={{ backgroundColor: p.bg, color: p.color, border: `1px solid ${p.color}40` }}
        aria-expanded={open}
        aria-label={`View ${p.label} ad performance for this charge`}
      >
        {p.label} ✦
      </button>

      {open && (
        <div
          className="absolute z-50 bottom-full right-0 mb-2 w-72 rounded-xl p-3.5 text-left shadow-2xl"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}
          role="dialog"
        >
          {failed ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Couldn&apos;t load ad insights. Try again shortly.</p>
          ) : !data ? (
            <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 size={12} className="animate-spin" /> Matching this charge to your {p.label} account…
            </p>
          ) : data.connected === false ? (
            <div>
              <p className="text-sm font-semibold text-white mb-1">Validate this ad spend</p>
              <p className="text-xs mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
                Connect {p.label} and Navi will match this charge to its exact billing period and show what it bought.
              </p>
              <a
                href={platform === 'META_ADS' ? '/api/auth/meta-ads' : '/api/auth/google-ads'}
                className="inline-block px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: '#3B82F6', color: '#fff' }}
              >
                Connect {p.label}
              </a>
            </div>
          ) : data.match && data.totals && data.kpis ? (
            <div className="space-y-2.5">
              {/* Verification line — the trust moment */}
              {data.match.matched ? (
                <p className="flex items-start gap-1.5 text-xs font-medium" style={{ color: '#10B981' }}>
                  <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Verified: matches {p.label} billing {fmtDay(data.match.from!)}–{fmtDay(data.match.to!)}
                    {data.match.delta !== 0 && ` (Δ ${formatCurrency(Math.abs(data.match.delta), true)})`}
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs font-medium" style={{ color: '#F59E0B' }}>
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>
                    No exact billing match — showing the trailing 30 days. Platform reported{' '}
                    {formatCurrency(data.match.platformSpend, true)} vs this {formatCurrency(data.charge?.amount ?? 0, true)} charge.
                  </span>
                </p>
              )}
              {data.match.accountName && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {data.match.accountName} · {data.match.days} day{data.match.days === 1 ? '' : 's'}
                  {data.match.basis === 'billing-window' ? ' billing window' : ''}
                </p>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                {kpiCell('Impressions', fmtInt(data.totals.impressions))}
                {kpiCell('Clicks', fmtInt(data.totals.clicks))}
                {kpiCell('CTR', data.kpis.ctr != null ? `${data.kpis.ctr.toFixed(2)}%` : '—')}
                {kpiCell('CPC', data.kpis.cpc != null ? formatCurrency(data.kpis.cpc) : '—')}
                {kpiCell('Conversions', fmtInt(data.totals.conversions))}
                {kpiCell('CPA', data.kpis.cpa != null ? formatCurrency(data.kpis.cpa) : '—')}
              </div>

              {data.kpis.roas != null && (
                <p className="text-xs font-semibold" style={{ color: data.kpis.roas >= 1 ? '#10B981' : '#EF4444' }}>
                  ROAS {data.kpis.roas.toFixed(2)}× — {formatCurrency(data.totals.conversionValue ?? 0, true)} attributed revenue
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No ad data for this charge yet — it&apos;ll appear after the next sync.</p>
          )}
        </div>
      )}
    </span>
  )
}
