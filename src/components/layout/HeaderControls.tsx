'use client'

/**
 * Desktop header cluster shared across every tab: the active organization (a
 * dropdown to switch entities for CFO / multi-entity users), an optional
 * reporting-period selector (YTD / This Month), and the profile avatar.
 * Keeps every page's top-right aligned with the Overview.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronDown, Check, Plus, Settings, LogOut } from 'lucide-react'
import { usePeriod } from './PeriodContext'

interface Org { id: string; name: string; role: string; active: boolean }
interface Me { name: string | null; email: string }

export default function HeaderControls({ showPeriod = false }: { showPeriod?: boolean }) {
  const { period, setPeriod } = usePeriod()
  const [me, setMe] = useState<Me | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [canCreate, setCanCreate] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user ?? null)).catch(() => {})
    fetch('/api/org/switch').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setOrgs(d.orgs ?? []); setCanCreate(!!d.canCreate) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const active = orgs.find((o) => o.active)
  const interactive = orgs.length > 1 || canCreate || active?.role === 'OWNER'
  const initial = (me?.name || me?.email || 'U').charAt(0).toUpperCase()

  async function switchOrg(orgId: string) {
    const res = await fetch('/api/org/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }),
    }).catch(() => null)
    if (res?.ok) window.location.assign('/dashboard')
  }

  return (
    <div className="hidden lg:flex items-center gap-3 pl-3 ml-1 border-l" style={{ borderColor: 'var(--color-surface-border)' }}>
      <div className="text-right">
        {/* Org / entity switcher */}
        <div ref={rootRef} className="relative">
          <button
            onClick={() => interactive && setOpen((v) => !v)}
            disabled={!interactive}
            aria-haspopup={interactive ? 'menu' : undefined}
            aria-expanded={open}
            className="flex items-center justify-end gap-1 text-sm font-semibold w-full"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <Building2 size={13} style={{ color: 'var(--color-text-muted)' }} />
            <span className="max-w-[160px] truncate">{active?.name ?? 'Naviio'}</span>
            {interactive && <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} />}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute top-full right-0 mt-2 w-60 rounded-xl shadow-2xl overflow-hidden z-50 text-left"
              style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
            >
              <p className="px-3 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Organizations</p>
              <ul className="max-h-56 overflow-y-auto pb-1">
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => (o.active ? setOpen(false) : switchOrg(o.id))}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      <Building2 size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      <span className="flex-1 min-w-0 truncate">{o.name}</span>
                      <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{o.role === 'OWNER' ? 'Owner' : 'Member'}</span>
                      {o.active && <Check size={14} style={{ color: '#10B981', flexShrink: 0 }} />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t py-1" style={{ borderColor: 'var(--color-surface-border)' }}>
                {canCreate && (
                  <Link href="/settings?tab=organization" onClick={() => setOpen(false)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5" style={{ color: '#3B82F6' }}>
                    <Plus size={13} /> New organization
                  </Link>
                )}
                <Link href="/settings" onClick={() => setOpen(false)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }}>
                  <Settings size={13} /> Settings
                </Link>
                <button onClick={async () => { try { await fetch('/api/auth/logout', { method: 'POST' }) } finally { window.location.href = '/login' } }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5" style={{ color: '#EF4444' }}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reporting period — only where a month scope is meaningful */}
        {showPeriod && (
          <div className="relative inline-flex items-center mt-0.5">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'ytd' | 'month')}
              className="appearance-none bg-transparent text-xs pr-4 cursor-pointer focus:outline-none"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label="Reporting period"
            >
              <option value="ytd">Year to Date</option>
              <option value="month">This Month</option>
            </select>
            <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        )}
      </div>

      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#3B82F6,#14B8A6)', color: '#fff' }}>
        {initial}
      </div>
    </div>
  )
}
