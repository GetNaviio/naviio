'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Users, UserPlus, Copy, Check, ArrowRight, Building2, Clock, Banknote } from 'lucide-react'

interface Client {
  orgId: string
  orgName: string
  clientEmail: string | null
  connectedSources: number
  lastSyncedAt: string | null
}
interface Pending {
  id: string
  clientEmail: string
  clientName: string | null
  expiresAt: string
  createdAt: string
}

export default function ClientsPage() {
  const router = useRouter()
  const [firm, setFirm] = useState<{ name: string } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/firm/clients')
      const data = await res.json()
      setFirm(data.firm)
      setClients(data.clients ?? [])
      setPending(data.pending ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !email) return
    setSubmitting(true)
    setError('')
    setInviteUrl('')
    try {
      const res = await fetch('/api/firm/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add client')
      setInviteUrl(data.inviteUrl)
      setEmail('')
      setName('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function openClient(orgId: string) {
    await fetch('/api/org/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    router.push('/dashboard')
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const card = { backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-surface-bg)' }}>
      <Header />
      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Users size={22} style={{ color: 'var(--color-info)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Clients
          </h1>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {firm ? firm.name : 'Your practice'} — invite clients, then open any client&rsquo;s workspace to do the work.
          Each client owns their own login and data; you have advisor access they can revoke anytime.
        </p>

        {/* Add client */}
        <div className="rounded-xl border p-5 mb-6" style={card}>
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={16} style={{ color: 'var(--color-info)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Add a client
            </h2>
          </div>
          <form onSubmit={addClient} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)', color: 'var(--color-text-primary)' }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company name (optional)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)', color: 'var(--color-text-primary)' }}
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-info)', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Creating…' : 'Create invite'}
            </button>
          </form>
          {error && <p className="text-xs mt-2" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          {inviteUrl && (
            <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Send this one-time link to your client. They sign up / log in with their own email, connect their bank &amp;
                Stripe, and approve your access.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs truncate px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--color-surface-bg)', color: 'var(--color-text-primary)' }}>
                  {inviteUrl}
                </code>
                <button onClick={copyInvite} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-primary)' }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Roster */}
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Your clients {clients.length > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>({clients.length})</span>}
        </h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={card}>
            <Building2 size={24} className="mx-auto mb-2" style={{ color: 'var(--color-text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              No clients yet. Add your first client above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.orgId} className="rounded-xl border p-4 flex items-center justify-between" style={card}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{c.orgName}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.clientEmail}</p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px]" style={{ color: c.connectedSources > 0 ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    <Banknote size={12} />
                    {c.connectedSources > 0 ? `${c.connectedSources} source${c.connectedSources === 1 ? '' : 's'} connected` : 'Awaiting bank / Stripe connection'}
                  </span>
                </div>
                <button onClick={() => openClient(c.orgId)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-info)' }}>
                  Open <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pending invites */}
        {pending.length > 0 && (
          <>
            <h2 className="text-sm font-semibold mt-6 mb-2" style={{ color: 'var(--color-text-primary)' }}>Pending invites</h2>
            <div className="space-y-2">
              {pending.map((p) => (
                <div key={p.id} className="rounded-xl border p-3 flex items-center justify-between" style={card}>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.clientName || p.clientEmail}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{p.clientEmail}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <Clock size={12} /> invited
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
