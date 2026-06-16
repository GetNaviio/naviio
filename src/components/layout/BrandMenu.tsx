'use client'

/**
 * Mobile header brand button (lg:hidden). Replaces the hamburger: tapping the
 * Naviio icon opens an account/utilities dropdown — signed-in user, organization
 * switch, search, refresh, theme toggle, Settings, and Sign out. Page navigation
 * lives in the bottom tab bar, so this menu stays short. The icon is theme-aware
 * so it blends with the header surface.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from './ThemeContext'
import { Check, Building2, RefreshCw, Search, Settings, LogOut, Moon, Sun } from 'lucide-react'

interface Org { id: string; name: string; role: string; active: boolean }
interface Me { name: string | null; email: string }

export default function BrandMenu() {
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user ?? null)).catch(() => {})
    fetch('/api/org/switch').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setOrgs(d.orgs ?? []) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function switchOrg(id: string) {
    const res = await fetch('/api/org/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: id }),
    }).catch(() => null)
    if (res?.ok) window.location.assign('/dashboard')
  }
  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } finally { window.location.href = '/login' }
  }

  const row = 'w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors hover:bg-white/5'
  const active = orgs.find((o) => o.active)
  const initial = (me?.name || me?.email || 'U').charAt(0).toUpperCase()

  return (
    <div ref={rootRef} className="relative lg:hidden flex-shrink-0">
      <button onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open} className="flex items-center -ml-1">
        <img
          src={theme === 'light' ? '/naviio-icon-light.png' : '/naviio-icon-dark.png'}
          alt="Naviio menu"
          width={34}
          height={34}
          className="rounded-lg"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo-icon.svg' }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-64 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          {/* Signed-in user */}
          <div className="flex items-center gap-3 px-3 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#3B82F6,#14B8A6)', color: '#fff' }}>{initial}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{me?.name || me?.email || '—'}</p>
              {active && <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{active.name}</p>}
            </div>
          </div>

          {/* Organizations — only when the user belongs to more than one */}
          {orgs.length > 1 && (
            <div className="py-1 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Organizations</p>
              {orgs.map((o) => (
                <button key={o.id} onClick={() => (o.active ? setOpen(false) : switchOrg(o.id))} className={row} style={{ color: 'var(--color-text-primary)' }}>
                  <Building2 size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.active && <Check size={15} style={{ color: '#10B981', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )}

          {/* Utilities */}
          <div className="py-1 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <button onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('naviio:open-search')) }} className={row} style={{ color: 'var(--color-text-secondary)' }}>
              <Search size={15} /> Search
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('naviio:refresh'))} className={row} style={{ color: 'var(--color-text-secondary)' }}>
              <RefreshCw size={15} /> Refresh data
            </button>
            <button onClick={toggleTheme} className={row} style={{ color: 'var(--color-text-secondary)' }}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />} {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
            <Link href="/settings" onClick={() => setOpen(false)} className={row} style={{ color: 'var(--color-text-secondary)' }}>
              <Settings size={15} /> Settings
            </Link>
          </div>

          {/* Sign out */}
          <button onClick={logout} className={row} style={{ color: '#EF4444' }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
