'use client'

/**
 * Client-facing control over advisor (fractional CFO / CPA) access to THIS org.
 * Lists advisors with access and lets the owner revoke any of them — the
 * "revoke anytime" promise made on the client-invite consent screen.
 */
import { useEffect, useState, useCallback } from 'react'
import Card from '@/components/ui/Card'
import { UserCheck, X } from 'lucide-react'

interface Advisor {
  userId: string
  email: string
  name: string | null
  since: string
}

export default function AdvisorAccessSection() {
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [firm, setFirm] = useState<{ name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/firm/advisors')
      if (res.ok) {
        const data = await res.json()
        setAdvisors(data.advisors ?? [])
        setFirm(data.firm ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function revoke(userId: string) {
    setBusy(userId)
    try {
      await fetch('/api/firm/advisors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      load()
    } finally {
      setBusy(null)
    }
  }

  // Nothing to show until there's at least one advisor.
  if (!loading && advisors.length === 0) return null

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <UserCheck size={16} style={{ color: 'var(--color-info)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Advisor access
        </h3>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        {firm ? `${firm.name} manages this workspace. ` : ''}
        These people have advisor access to your financials. They can view and categorize, but never move money or
        change your settings. You can revoke access at any time.
      </p>
      <div className="space-y-2">
        {advisors.map((a) => (
          <div
            key={a.userId}
            className="flex items-center justify-between rounded-lg border p-3"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <div>
              <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{a.name || a.email}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{a.email}</p>
            </div>
            <button
              onClick={() => revoke(a.userId)}
              disabled={busy === a.userId}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded font-medium"
              style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-danger)' }}
            >
              <X size={13} /> {busy === a.userId ? 'Removing…' : 'Revoke'}
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}
