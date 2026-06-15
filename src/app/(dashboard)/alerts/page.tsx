'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import AlertFeed from '@/components/alerts/AlertFeed'
import type { Alert } from '@/types'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical' | 'warning'>('all')

  useEffect(() => {
    let alive = true
    fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setAlerts(d?.alerts ?? []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function markAllRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })))
    await fetch('/api/alerts', { method: 'PATCH', body: JSON.stringify({ all: true }) }).catch(() => {})
  }

  const filtered = alerts.filter((a) => {
    if (filter === 'unread') return !a.readAt
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'warning') return a.severity === 'warning'
    return true
  })

  const unreadCount = alerts.filter((a) => !a.readAt).length
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return (
    <div>
      <Header title="Alerts & Anomalies" subtitle="Proactive notifications for low cash, unusual spending, and revenue changes" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Alerts', count: alerts.length, color: 'var(--color-text-secondary)' },
            { label: 'Unread', count: unreadCount, color: '#3B82F6' },
            { label: 'Warnings', count: warningCount, color: '#F59E0B' },
            { label: 'Critical', count: criticalCount, color: '#EF4444' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl p-4 text-center" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
              <p className="text-3xl font-bold" style={{ color }}>{loading ? '—' : count}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>

        <Card
          title="Alert Feed"
          subtitle={loading ? 'Loading…' : `${filtered.length} alert${filtered.length === 1 ? '' : 's'}`}
          tooltip="Notifications Naviio raises when it detects notable financial events — low cash, anomalous spend, churn risk, or revenue changes — from your connected data."
          action={
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {(['all', 'unread', 'warning', 'critical'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="px-2.5 py-1 rounded text-xs font-medium capitalize transition-all"
                    style={{ backgroundColor: filter === f ? '#3B82F6' : 'var(--color-surface-card-hover)', color: filter === f ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs font-medium transition-colors" style={{ color: 'var(--color-text-muted)' }}>
                  Mark all read
                </button>
              )}
            </div>
          }
        >
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-surface-card-hover)' }} />)}
            </div>
          ) : (
            <AlertFeed alerts={filtered} />
          )}
        </Card>
      </div>
    </div>
  )
}
