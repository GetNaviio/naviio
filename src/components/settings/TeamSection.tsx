'use client'

/**
 * Team management — the seats the pricing page sells. Owner invites by link
 * (shown once, copy it), sees pending invites, removes members. Members see
 * the roster read-only. An org switcher appears only for users who belong to
 * more than one organization.
 */
import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { Users, Copy, CheckCircle, Loader2, Trash2, Mail, RefreshCw, ArrowLeftRight } from 'lucide-react'

interface Member { userId: string; email: string; name: string | null; role: 'OWNER' | 'MEMBER'; joinedAt: string | null }
interface Invite { id: string; email: string; expiresAt: string; createdAt: string; expired: boolean }
interface Seats { used: number; members: number; pendingInvites: number; limit: number | null; plan: string }
interface Org { id: string; name: string; role: string; active: boolean }

// "CFO" is an acronym — keep it upper; others are title-cased (Starter, Growth, Pro).
const planLabel = (p: string) => (p === 'CFO' ? 'CFO' : p.charAt(0) + p.slice(1).toLowerCase())

export default function TeamSection() {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [seats, setSeats] = useState<Seats | null>(null)
  const [yourRole, setYourRole] = useState<'OWNER' | 'MEMBER' | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The freshly created invite link — shown once, with a copy affordance.
  const [newLink, setNewLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  // 'loading' → spinner; 'error' → visible failure message (never a blank card)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    try {
      const [mRes, oRes] = await Promise.all([fetch('/api/org/members'), fetch('/api/org/switch')])
      // Session expired/invalid: bounce to login (and back) rather than showing a
      // misleading "run the migration" error for what is really an auth lapse.
      if (mRes.status === 401 || mRes.status === 403) {
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.replace(`/login?next=${next}`)
        return
      }
      if (mRes.ok) {
        const m = await mRes.json()
        setMembers(m.members ?? [])
        setSeats(m.seats ?? null)
        setYourRole(m.yourRole ?? null)
        setStatus('ready')
        if (m.yourRole === 'OWNER') {
          const iRes = await fetch('/api/org/invites')
          if (iRes.ok) setInvites((await iRes.json()).invites ?? [])
        }
      } else {
        setStatus('error')
      }
      if (oRes.ok) setOrgs((await oRes.json()).orgs ?? [])
    } catch { setStatus('error') }
  }, [])
  useEffect(() => { load() }, [load])

  async function invite(targetEmail: string) {
    setBusy(true); setError(''); setNewLink(null); setCopied(false)
    try {
      const res = await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not create the invite'); return }
      setNewLink({ email: data.email, url: data.inviteUrl })
      setEmail('')
      await load()
    } catch { setError('Network error — please try again') }
    finally { setBusy(false) }
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  async function revoke(id: string) {
    await fetch(`/api/org/invites/${id}`, { method: 'DELETE' }).catch(() => {})
    if (newLink && invites.find((i) => i.id === id)?.email === newLink.email) setNewLink(null)
    await load()
  }

  async function removeMember(userId: string) {
    setRemoving(null)
    await fetch(`/api/org/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {})
    await load()
  }

  async function switchOrg(orgId: string) {
    setSwitching(true)
    try {
      const res = await fetch('/api/org/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      // Every tab reads through the same org resolution — full reload is the
      // honest way to swap the entire workspace.
      if (res.ok) window.location.assign('/dashboard')
    } finally { setSwitching(false) }
  }

  const seatsText = seats
    ? `${seats.used} of ${seats.limit ?? '∞'} seat${seats.limit === 1 ? '' : 's'} used · ${planLabel(seats.plan)} plan`
    : ''
  const atLimit = seats != null && seats.limit != null && seats.used >= seats.limit

  return (
    <>
      <Card
        title="Team"
        subtitle={seatsText || 'People with access to this organization'}
        tooltip="Everyone on the team sees the same live financials. Invites are sent as links — share them over any channel; the invitee must sign in with the invited email address."
      >
        <div className="space-y-4">
          {status === 'loading' && (
            <p className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Loading your team…
            </p>
          )}
          {status === 'error' && (
            <p className="text-sm py-1" style={{ color: '#F59E0B' }}>
              Couldn&apos;t load the team roster. Please refresh the page — if it keeps
              happening, try signing out and back in.
            </p>
          )}
          {/* Roster */}
          <ul className="divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
            {members.map((m) => (
              <li key={m.userId} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
                    {(m.name || m.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{m.name || m.email}</p>
                    {m.name && <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{m.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={m.role === 'OWNER' ? 'info' : 'neutral'} size="sm">{m.role === 'OWNER' ? 'Owner' : 'Member'}</Badge>
                  {yourRole === 'OWNER' && m.role !== 'OWNER' && (
                    removing === m.userId ? (
                      <span className="text-xs flex items-center gap-1.5">
                        <button onClick={() => removeMember(m.userId)} className="font-semibold" style={{ color: '#EF4444' }}>Remove</button>
                        <button onClick={() => setRemoving(null)} style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setRemoving(m.userId)} aria-label={`Remove ${m.email}`}
                        className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}>
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Invite form — owner only */}
          {yourRole === 'OWNER' && (
            <div>
              <form
                onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite(email.trim()) }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  required
                  disabled={atLimit}
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
                />
                <button
                  type="submit"
                  disabled={busy || atLimit}
                  className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#3B82F6', color: '#fff' }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Invite
                </button>
              </form>
              {atLimit && (
                <p className="text-xs mt-2" style={{ color: '#F59E0B' }}>
                  All seats are in use — upgrade your plan to invite more teammates.
                </p>
              )}
              {error && <p className="text-xs mt-2" style={{ color: '#EF4444' }}>{error}</p>}

              {/* The one-time link */}
              {newLink && (
                <div className="mt-3 px-3 py-2.5 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium" style={{ color: '#10B981' }}>Invite link for {newLink.email} — copy it now, it&apos;s shown only once:</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{newLink.url}</p>
                  </div>
                  <button onClick={() => copyLink(newLink.url)} className="p-1.5 rounded flex-shrink-0 transition-colors hover:bg-white/5"
                    aria-label="Copy invite link" style={{ color: copied ? '#10B981' : 'var(--color-text-muted)' }}>
                    {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pending invites — owner only */}
          {yourRole === 'OWNER' && invites.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Pending invites
              </p>
              <ul className="space-y-1.5">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate" style={{ color: 'var(--color-text-secondary)' }}>{i.email}</span>
                    <span className="flex items-center gap-2 flex-shrink-0 text-xs">
                      {i.expired
                        ? <Badge variant="warning" size="sm">Expired</Badge>
                        : <span style={{ color: 'var(--color-text-muted)' }}>expires {new Date(i.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                      <button onClick={() => invite(i.email)} title="Generate a fresh link"
                        className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}>
                        <RefreshCw size={13} />
                      </button>
                      <button onClick={() => revoke(i.id)} title="Revoke invite"
                        className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: '#EF4444' }}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Org switcher — only when the user belongs to several orgs */}
      {orgs.length > 1 && (
        <Card title="Your Organizations" subtitle="Switch which company's books you're working in">
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <Users size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{o.name}</span>
                  <Badge variant={o.role === 'OWNER' ? 'info' : 'neutral'} size="sm">{o.role === 'OWNER' ? 'Owner' : 'Member'}</Badge>
                </div>
                {o.active ? (
                  <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#10B981' }}>
                    <CheckCircle size={13} /> Active
                  </span>
                ) : (
                  <button onClick={() => switchOrg(o.id)} disabled={switching}
                    className="text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
                    style={{ color: '#3B82F6', border: '1px solid var(--color-surface-border)' }}>
                    <ArrowLeftRight size={12} /> Switch
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
