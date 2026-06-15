'use client'

/**
 * Client portal manager (owner only). Create a read-only share link, choose
 * which sections it exposes and an optional expiry, copy it once, and revoke
 * any link instantly. Renders nothing for non-owners.
 */
import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { Loader2, Copy, CheckCircle, Trash2, Link2, ExternalLink, RefreshCw } from 'lucide-react'

interface Share {
  id: string
  label: string
  scopes: string[]
  expiresAt: string | null
  revokedAt: string | null
  lastViewedAt: string | null
  viewCount: number
  active: boolean
}

const SCOPE_LABEL: Record<string, string> = { pnl: 'P&L', cash: 'Cash', kpis: 'KPIs' }
const ALL = ['pnl', 'cash', 'kpis'] as const

export default function PortalSection() {
  const [shares, setShares] = useState<Share[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading')
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState<string[]>([...ALL])
  const [expiry, setExpiry] = useState('') // '' = never, else days
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newLink, setNewLink] = useState<{ label: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/org/portal')
      if (res.status === 403) { setStatus('forbidden'); return }
      if (!res.ok) { setStatus('error'); return }
      setShares((await res.json()).shares ?? [])
      setStatus('ready')
    } catch { setStatus('error') }
  }, [])
  useEffect(() => { load() }, [load])

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (label.trim().length < 2 || scopes.length === 0) return
    setBusy(true); setError(''); setNewLink(null); setCopied(false)
    try {
      const res = await fetch('/api/org/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          scopes,
          expiresInDays: expiry ? Number(expiry) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not create the link'); return }
      setNewLink({ label: data.label, url: data.portalUrl })
      setLabel('')
      await load()
    } catch { setError('Network error — please try again') }
    finally { setBusy(false) }
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  async function revoke(id: string) {
    await fetch(`/api/org/portal/${id}`, { method: 'DELETE' }).catch(() => {})
    await load()
  }

  // Tokens are stored hashed and can't be shown again, so "get the link" mints a
  // fresh one (the old URL stops working) and surfaces it in the copy banner.
  async function regenerate(id: string) {
    setError(''); setNewLink(null); setCopied(false)
    try {
      const res = await fetch(`/api/org/portal/${id}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not regenerate the link'); return }
      setNewLink({ label: data.label, url: data.portalUrl })
      await load()
    } catch { setError('Network error — please try again') }
  }

  if (status === 'forbidden') return null // members don't manage shares

  return (
    <Card
      title="Client Portal"
      subtitle="Share a read-only view of these books — no login required"
      tooltip="Each link shows live figures for the sections you pick. Revoke any link instantly; revoked or expired links stop working on the next view. Anyone with the link can view it, so share it carefully."
    >
      <div className="space-y-4">
        {status === 'loading' && (
          <p className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 size={14} className="animate-spin" /> Loading share links…
          </p>
        )}
        {status === 'error' && (
          <p className="text-sm py-1" style={{ color: '#F59E0B' }}>
            Couldn&apos;t load portal links. If you just updated the app, run the pending database
            migration and restart the server, then refresh.
          </p>
        )}

        {status === 'ready' && (
          <>
            {/* Existing links */}
            {shares.length > 0 && (
              <ul className="space-y-2">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                        <Link2 size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        {s.label}
                        {!s.active && <Badge variant="warning" size="sm">{s.revokedAt ? 'Revoked' : 'Expired'}</Badge>}
                      </p>
                      <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
                        <span>{s.scopes.map((x) => SCOPE_LABEL[x] ?? x).join(' · ')}</span>
                        <span>·</span>
                        <span>{s.viewCount} view{s.viewCount === 1 ? '' : 's'}</span>
                        {s.expiresAt && <><span>·</span><span>expires {new Date(s.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
                      </p>
                    </div>
                    {s.active && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => regenerate(s.id)} title="Get a fresh copyable link (the old one stops working)"
                          className="p-1.5 rounded transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}>
                          <RefreshCw size={14} />
                        </button>
                        <button onClick={() => revoke(s.id)} title="Revoke link"
                          className="p-1.5 rounded transition-colors hover:bg-white/5" style={{ color: '#EF4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* One-time link banner */}
            {newLink && (
              <div className="px-3 py-2.5 rounded-lg flex items-center gap-2"
                style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium" style={{ color: '#10B981' }}>Portal link for “{newLink.label}” — copy it now:</p>
                  <a href={newLink.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs truncate mt-0.5 flex items-center gap-1 hover:underline" style={{ color: 'var(--color-text-secondary)' }}>
                    {newLink.url} <ExternalLink size={11} style={{ flexShrink: 0 }} />
                  </a>
                </div>
                <button onClick={() => copy(newLink.url)} className="p-1.5 rounded flex-shrink-0 transition-colors hover:bg-white/5"
                  aria-label="Copy portal link" style={{ color: copied ? '#10B981' : 'var(--color-text-muted)' }}>
                  {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
                </button>
              </div>
            )}

            {/* Create form */}
            <form onSubmit={create} className="space-y-2.5 pt-1">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What's this link for? (e.g. Q2 board view)"
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                {ALL.map((s) => {
                  const on = scopes.includes(s)
                  return (
                    <button type="button" key={s} onClick={() => toggleScope(s)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={on
                        ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.4)' }
                        : { color: 'var(--color-text-muted)', border: '1px solid var(--color-surface-border)' }}>
                      {SCOPE_LABEL[s]}
                    </button>
                  )
                })}
                <select value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  className="ml-auto px-2.5 py-1 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  <option value="">Never expires</option>
                  <option value="7">Expires in 7 days</option>
                  <option value="30">Expires in 30 days</option>
                  <option value="90">Expires in 90 days</option>
                </select>
              </div>
              {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
              <button type="submit" disabled={busy || label.trim().length < 2 || scopes.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
                style={{ backgroundColor: '#3B82F6', color: '#fff' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Create share link
              </button>
            </form>
          </>
        )}
      </div>
    </Card>
  )
}
