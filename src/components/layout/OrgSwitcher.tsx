'use client'

/**
 * The sidebar user pill, made real: shows the signed-in user and the ACTIVE
 * organization, and (for users in several orgs, or CFO Suite owners) opens a
 * popover to switch entities, rename the active one, or create a new client
 * entity. Each entity is a fully separate set of books — switching swaps the
 * whole workspace, so it's an honest full reload.
 */
import { useEffect, useRef, useState } from 'react'
import { LogOut, ChevronsUpDown, Check, Plus, Pencil, Loader2, Building2 } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface Org { id: string; name: string; role: string; active: boolean }
interface Me { name: string | null; email: string }

export default function OrgSwitcher() {
  const [me, setMe] = useState<Me | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [canCreate, setCanCreate] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'create' | 'rename'>('list')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  // Focus trap for the open menu: cycles Tab within it, Escape closes, focus
  // returns to the trigger on close.
  const popoverRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false))

  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user ?? null)).catch(() => {})
    fetch('/api/org/switch').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setOrgs(d.orgs ?? []); setCanCreate(!!d.canCreate) }
    }).catch(() => {})
  }, [])

  // Click-away closes the popover. (Escape + focus trapping is handled by useFocusTrap.)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = orgs.find((o) => o.active)
  const interactive = orgs.length > 1 || canCreate || active?.role === 'OWNER'

  async function switchOrg(orgId: string) {
    setBusy(true)
    const res = await fetch('/api/org/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }),
    }).catch(() => null)
    if (res?.ok) window.location.assign('/dashboard')
    else setBusy(false)
  }

  async function submit() {
    if (name.trim().length < 2) return
    setBusy(true); setError('')
    try {
      const res = mode === 'create'
        ? await fetch('/api/org/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) })
        : await fetch('/api/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Something went wrong'); setBusy(false); return }
      // Create lands in the new entity; rename just needs fresh chrome.
      window.location.assign(mode === 'create' ? '/dashboard' : window.location.pathname)
    } catch { setError('Network error — please try again'); setBusy(false) }
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } finally { window.location.href = '/login' }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Popover (opens upward) */}
      {open && (
        <div
          ref={popoverRef}
          tabIndex={-1}
          role="menu"
          aria-label="Organizations"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-2xl overflow-hidden z-50 outline-none"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          {mode === 'list' ? (
            <>
              <p className="px-3 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Organizations
              </p>
              <ul className="max-h-56 overflow-y-auto pb-1">
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => (o.active ? setOpen(false) : switchOrg(o.id))}
                      disabled={busy}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5 disabled:opacity-50"
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
              {(canCreate || active?.role === 'OWNER') && (
                <div className="border-t py-1" style={{ borderColor: 'var(--color-surface-border)' }}>
                  {active?.role === 'OWNER' && (
                    <button
                      onClick={() => { setMode('rename'); setName(active.name); setError('') }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <Pencil size={13} /> Rename {active.name}
                    </button>
                  )}
                  {canCreate && (
                    <button
                      onClick={() => { setMode('create'); setName(''); setError('') }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5"
                      style={{ color: '#3B82F6' }}
                    >
                      <Plus size={13} /> New organization
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-3">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {mode === 'create' ? 'New client entity' : 'Rename organization'}
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                placeholder="Acme Plumbing LLC"
                className="w-full px-2.5 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
              />
              {error && <p className="text-xs mt-1.5" style={{ color: '#EF4444' }}>{error}</p>}
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={submit}
                  disabled={busy || name.trim().length < 2}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: '#3B82F6', color: '#fff' }}
                >
                  {busy && <Loader2 size={12} className="animate-spin" />}
                  {mode === 'create' ? 'Create & open' : 'Save'}
                </button>
                <button onClick={() => setMode('list')} className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}>
                  Cancel
                </button>
              </div>
              {mode === 'create' && (
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  A separate set of books. You&apos;ll land in it ready to connect the client&apos;s bank.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pill */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #14B8A6)', color: '#fff' }}>
          {(me?.name || me?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <button
          onClick={() => { if (interactive) { setMode('list'); setOpen((v) => !v) } }}
          className="flex-1 min-w-0 text-left"
          aria-haspopup={interactive ? 'menu' : undefined}
          aria-expanded={open}
          disabled={!interactive}
        >
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {me?.name || me?.email || '—'}
          </p>
          <p className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="truncate">{active?.name ?? 'Naviio'}</span>
            {interactive && <ChevronsUpDown size={11} style={{ flexShrink: 0 }} />}
          </p>
        </button>
        <button className="transition-colors flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Sign out" onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>
    </div>
  )
}
