'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { formatCurrency } from '@/lib/utils'
import { scoreColor } from '@/lib/metrics/scoring'
import { industryLabel, type Industry } from '@/lib/metrics/industry'
import { Users, UserPlus, ArrowRight, AlertTriangle, Building2 } from 'lucide-react'

type Status = 'healthy' | 'watch' | 'at_risk' | 'no_data' | 'needs_reconnect'

interface Vitals {
  orgId: string
  orgName: string
  clientEmail: string | null
  industry: Industry
  cash: number | null
  runwayMonths: number | 'infinity' | null
  netMargin: number | null
  revenueGrowth: number | null
  score: number | null
  status: Status
  alerts: string[]
  connectedSources: number
}
interface Rollup { total: number; healthy: number; watch: number; atRisk: number; needsData: number; totalCash: number }
interface Alert { orgId: string; orgName: string; alert: string; status: Status }
interface Payload { firm: { id: string } | null; clients: Vitals[]; rollup: Rollup; alerts: Alert[] }

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  healthy:         { label: 'Healthy',      color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  watch:           { label: 'Watch',        color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  at_risk:         { label: 'At risk',      color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  no_data:         { label: 'No data',      color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  needs_reconnect: { label: 'Reconnect',    color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
}

const runwayLabel = (r: number | 'infinity' | null) =>
  r == null ? '—' : r === 'infinity' ? 'Cash +' : `${Math.round(r)}mo`

export default function AdvisorHomePage() {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/firm/clients/vitals')
      setData(res.ok ? await res.json() : null)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function openClient(orgId: string) {
    setOpening(orgId)
    await fetch('/api/org/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) }).catch(() => {})
    router.push('/dashboard')
  }

  const card = { backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }
  const clients = data?.clients ?? []
  const rollup = data?.rollup
  const alerts = data?.alerts ?? []

  return (
    <div>
      <Header title="Advisor Home" subtitle="Your whole client book at a glance — who needs you today" />

      <div className="p-4 sm:p-6 space-y-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl h-24 animate-pulse" style={{ backgroundColor: 'var(--color-surface-card)' }} />)}
          </div>
        ) : !data?.firm || clients.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={card}>
            <Users size={26} className="mx-auto mb-3" style={{ color: 'var(--color-info)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>No clients yet</h3>
            <p className="text-sm mt-1 mb-4" style={{ color: 'var(--color-text-secondary)' }}>Add your first client and each gets its own connected dashboard, P&amp;L, and Navi Score.</p>
            <Link href="/clients" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-info)' }}>
              <UserPlus size={15} /> Add a client
            </Link>
          </div>
        ) : (
          <>
            {/* Portfolio rollup */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Clients', value: String(rollup!.total), color: 'var(--color-text-primary)' },
                { label: 'Healthy', value: String(rollup!.healthy), color: '#10B981' },
                { label: 'Watch', value: String(rollup!.watch), color: '#F59E0B' },
                { label: 'At risk', value: String(rollup!.atRisk), color: '#EF4444' },
                { label: 'Total cash', value: formatCurrency(rollup!.totalCash, true), color: 'var(--color-text-primary)' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4" style={card}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="text-xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Needs attention feed */}
            {alerts.length > 0 && (
              <div className="rounded-xl p-5" style={card}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Needs attention</h3>
                </div>
                <div className="space-y-1.5">
                  {alerts.slice(0, 8).map((a, i) => (
                    <button key={i} onClick={() => openClient(a.orgId)} className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg transition-colors hover:opacity-80">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_META[a.status].color }} />
                      <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{a.orgName}</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{a.alert}</span>
                      <ArrowRight size={13} className="ml-auto flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Client roster with vitals */}
            <div className="rounded-xl overflow-hidden" style={card}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                      {['Client', 'Score', 'Cash', 'Runway', 'Net margin', 'Rev MoM', 'Status', ''].map((h) => (
                        <th key={h} className="text-left py-3 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => {
                      const sm = STATUS_META[c.status]
                      return (
                        <tr key={c.orgId} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Building2 size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                              <div className="min-w-0">
                                <p className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{c.orgName}</p>
                                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{industryLabel(c.industry)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-bold" style={{ color: c.score == null ? 'var(--color-text-muted)' : scoreColor(c.score) }}>{c.score ?? '—'}</td>
                          <td className="py-3 px-3" style={{ color: 'var(--color-text-primary)' }}>{c.cash == null ? '—' : formatCurrency(c.cash, true)}</td>
                          <td className="py-3 px-3" style={{ color: 'var(--color-text-secondary)' }}>{runwayLabel(c.runwayMonths)}</td>
                          <td className="py-3 px-3" style={{ color: 'var(--color-text-secondary)' }}>{c.netMargin == null ? '—' : `${c.netMargin.toFixed(0)}%`}</td>
                          <td className="py-3 px-3" style={{ color: c.revenueGrowth == null ? 'var(--color-text-secondary)' : c.revenueGrowth >= 0 ? '#10B981' : '#EF4444' }}>{c.revenueGrowth == null ? '—' : `${c.revenueGrowth >= 0 ? '+' : ''}${c.revenueGrowth.toFixed(0)}%`}</td>
                          <td className="py-3 px-3"><span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: sm.bg, color: sm.color }}>{sm.label}</span></td>
                          <td className="py-3 px-3 text-right">
                            <button onClick={() => openClient(c.orgId)} disabled={opening === c.orgId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--color-info)' }}>
                              {opening === c.orgId ? 'Opening…' : 'Open'} <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <Link href="/clients" className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg" style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                <UserPlus size={15} /> Manage clients &amp; invites
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
