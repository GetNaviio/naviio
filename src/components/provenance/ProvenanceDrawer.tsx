'use client'

/**
 * The provenance drawer — click any figure, see the transactions behind it.
 * This is the trust layer's capstone: a number stops being an assertion and
 * becomes an audit trail. The footer reconciles the list against the figure
 * the user clicked, and says so explicitly.
 */
import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/useFocusTrap'

export interface ProvenanceQuery {
  /** Human label for the header, e.g. "May 2026 · Expenses · Software" */
  label: string
  /** The on-screen figure being proven — footer reconciles against it */
  figure: number
  scope: 'month' | 'ytd'
  month?: string // 'YYYY-MM'
  bucket: 'income' | 'expenses'
  category?: string
}

interface Row {
  date: string
  description: string
  merchantName: string | null
  source: string
  amount: number
  category: string | null
}

const SOURCE_LABEL: Record<string, string> = { plaid: 'Bank', stripe: 'Stripe', quickbooks: 'QuickBooks', xero: 'Xero' }

export default function ProvenanceDrawer({ query, onClose }: { query: ProvenanceQuery; onClose: () => void }) {
  const [data, setData] = useState<{ rows: Row[]; total: number; count: number } | null>(null)
  const [failed, setFailed] = useState(false)
  // Focus trap + Escape-to-close + focus restore (the drawer is mounted only while open).
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose)

  useEffect(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams({ scope: query.scope, bucket: query.bucket })
    if (query.month) params.set('month', query.month)
    if (query.category) params.set('category', query.category)
    fetch(`/api/pl/provenance?${params}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch((e) => { if (e?.name !== 'AbortError') setFailed(true) })
    return () => ctrl.abort()
  }, [query])

  // The trust verdict: does the list reconcile with the figure on screen?
  const reconciles = data != null && Math.abs(data.total - query.figure) < 0.01

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Transactions behind ${query.label}`}>
      {/* Scrim */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative h-full w-full max-w-md flex flex-col shadow-2xl outline-none"
        style={{ backgroundColor: 'var(--color-surface-card)', borderLeft: '1px solid var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Where this number comes from</p>
            <h2 className="text-sm font-semibold text-white mt-0.5 truncate">{query.label}</h2>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(query.figure)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg transition-colors hover:bg-white/5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {failed ? (
            <p className="p-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>Couldn&apos;t load the transactions. Close and try again.</p>
          ) : !data ? (
            <p className="p-5 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Tracing transactions…
            </p>
          ) : data.rows.length === 0 ? (
            <p className="p-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions in this period.</p>
          ) : (
            <ul>
              {data.rows.map((r, i) => (
                <li key={i} className="px-5 py-3 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{r.description || r.merchantName || '—'}</p>
                    <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <Badge variant="info" size="sm">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
                      {r.category && <span>{r.category}</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: query.bucket === 'income' ? '#10B981' : 'var(--color-text-primary)' }}>
                    {formatCurrency(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — the reconciliation verdict */}
        {data && (
          <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--color-text-secondary)' }}>{data.count} transaction{data.count === 1 ? '' : 's'}</span>
              <span className="font-bold text-white">{formatCurrency(data.total)}</span>
            </div>
            {reconciles ? (
              <p className="flex items-center gap-1.5 text-xs mt-2 font-medium" style={{ color: '#10B981' }}>
                <CheckCircle size={12} /> Sums exactly to the figure above
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs mt-2 font-medium" style={{ color: '#F59E0B' }}>
                <AlertTriangle size={12} /> Differs from the figure by {formatCurrency(Math.abs(data.total - query.figure))} — data may have synced since the page loaded. Refresh to reconcile.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
