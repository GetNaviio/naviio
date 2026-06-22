'use client'

/**
 * Firm team roster + management. Partners see an add form and can remove members
 * and set tiers; Analysts see a read-only roster. Tiers:
 *   Partner — full firm access (billing, branding, clients, team)
 *   Analyst — client work only, no firm admin
 * Clients aren't shown here — they own their own orgs (managed in the roster).
 */
import { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, Loader2, X, ShieldCheck } from 'lucide-react'

interface Member {
  userId: string
  email: string
  name: string | null
  role: 'PARTNER' | 'ANALYST'
  isOwner: boolean
}

const card = { backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }

export default function FirmTeamSection() {
  const [members, setMembers] = useState<Member[]>([])
  const [role, setRole] = useState<'PARTNER' | 'ANALYST' | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<'PARTNER' | 'ANALYST'>('ANALYST')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/firm/team')
      if (!res.ok) return
      const d = await res.json()
      setMembers(d.members ?? [])
      setRole(d.role ?? null)
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!email.trim()) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/firm/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: newRole }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Could not add member'); return }
      setEmail('')
      await load()
    } catch { setError('Network error — please try again') }
    finally { setBusy(false) }
  }

  async function remove(userId: string) {
    setBusy(true); setError('')
    try {
      await fetch(`/api/firm/team?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      await load()
    } finally { setBusy(false) }
  }

  if (!loaded) {
    return (
      <div className="rounded-xl border p-5 mb-6" style={card}>
        <p className="text-xs animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading team…</p>
      </div>
    )
  }

  const isPartner = role === 'PARTNER'

  return (
    <div className="rounded-xl border p-5 mb-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <Users size={16} style={{ color: 'var(--color-info)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Firm team</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Partners manage billing, branding, and the client book. Analysts do client work without firm admin.
      </p>

      <div className="space-y-2 mb-4">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ border: '1px solid var(--color-surface-border)' }}>
            <div className="min-w-0">
              <p className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{m.name || m.email}</p>
              {m.name && <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{m.email}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: m.role === 'PARTNER' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)', color: m.role === 'PARTNER' ? '#10B981' : '#3B82F6' }}>
                {m.role === 'PARTNER' && <ShieldCheck size={11} />}
                {m.isOwner ? 'Owner · Partner' : m.role === 'PARTNER' ? 'Partner' : 'Analyst'}
              </span>
              {isPartner && !m.isOwner && (
                <button onClick={() => remove(m.userId)} disabled={busy} aria-label="Remove member"
                  className="p-1 rounded transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isPartner ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'PARTNER' | 'ANALYST')}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
          >
            <option value="ANALYST">Analyst</option>
            <option value="PARTNER">Partner</option>
          </select>
          <button onClick={add} disabled={busy || !email.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-info)' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
          </button>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Only a Partner can manage the team.</p>
      )}
      {error && <p className="text-xs mt-2" style={{ color: '#EF4444' }}>{error}</p>}
      <p className="text-[11px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
        Team members must have a Naviio account. Add them by the email they signed up with.
      </p>
    </div>
  )
}
