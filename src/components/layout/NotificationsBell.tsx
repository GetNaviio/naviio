'use client'

/**
 * Header notifications bell, wired to /api/alerts. Shows a live unread count on
 * the dot, a dropdown of recent alerts, mark-one / mark-all read, and a link to
 * the full Alerts page. Closes on click-away or Escape.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertTriangle, TrendingDown, TrendingUp, Activity, CheckCheck } from 'lucide-react'

interface Alert {
  id: string
  type: string
  severity: string
  title: string
  message: string
  createdAt: string
  readAt: string | null
}

const ICON: Record<string, typeof Bell> = {
  low_cash: TrendingDown,
  revenue_drop: TrendingDown,
  milestone: TrendingUp,
  churn_risk: AlertTriangle,
  anomaly: Activity,
}
const SEV_COLOR: Record<string, string> = { critical: '#EF4444', high: '#EF4444', medium: '#F59E0B', low: '#3B82F6', info: '#3B82F6' }

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); return `${d}d ago`
}

export default function NotificationsBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/alerts')
      if (r.ok) setAlerts((await r.json()).alerts ?? [])
    } catch { /* keep prior */ }
    finally { setLoading(false) }
  }, [])

  // Initial load for the dot; a global refresh remounts this via the layout's
  // RefreshBoundary, so no separate listener is needed here.
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!open) return
    load()
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, load])

  const unread = alerts.filter((a) => !a.readAt).length

  async function openAlert(a: Alert) {
    setOpen(false)
    if (!a.readAt) {
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, readAt: new Date().toISOString() } : x)))
      fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) }).catch(() => {})
    }
    router.push('/alerts')
  }

  async function markAll() {
    setAlerts((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).catch(() => {})
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg transition-colors relative"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ backgroundColor: '#EF4444', color: '#fff' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-info)' }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3.5 py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : alerts.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>You&apos;re all caught up — no alerts.</p>
            ) : (
              alerts.slice(0, 8).map((a) => {
                const Icon = ICON[a.type] ?? Activity
                const color = SEV_COLOR[a.severity] ?? '#3B82F6'
                return (
                  <button
                    key={a.id}
                    onClick={() => openAlert(a)}
                    className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5 border-b"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: a.readAt ? 'transparent' : 'rgba(59,130,246,0.05)' }}
                  >
                    <span className="mt-0.5 flex-shrink-0"><Icon size={15} style={{ color }} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{a.title}</span>
                        {!a.readAt && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#3B82F6' }} />}
                      </span>
                      <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{a.message}</span>
                      <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ago(a.createdAt)}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <button
            onClick={() => { setOpen(false); router.push('/alerts') }}
            className="w-full py-2.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-info)' }}
          >
            View all alerts
          </button>
        </div>
      )}
    </div>
  )
}
