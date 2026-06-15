'use client'

/**
 * Invite landing page — the link an owner shares. Public preview (org name +
 * invited email), then: logged in → one-click accept; logged out → login /
 * register with a ?next= round-trip back here. Accepting requires signing in
 * with the invited email, and the API enforces it.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Preview {
  valid: boolean
  accepted?: boolean
  expired?: boolean
  orgName?: string
  email?: string
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [me, setMe] = useState<{ email: string } | null | undefined>(undefined) // undefined = checking
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/org/invites/preview?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => setPreview({ valid: false }))
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null))
  }, [token])

  async function accept() {
    setAccepting(true)
    setError('')
    try {
      const res = await fetch('/api/org/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not accept the invite'); return }
      setJoined(true)
      setTimeout(() => { router.push('/dashboard'); router.refresh() }, 900)
    } catch { setError('Network error — please try again') }
    finally { setAccepting(false) }
  }

  const next = `/invite/${token}`

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#060D1F' }}>
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
      >
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,184,166,0.18))' }}>
          <Users size={22} style={{ color: '#3B82F6' }} />
        </div>

        {!preview || me === undefined ? (
          <p className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 size={14} className="animate-spin" /> Checking your invite…
          </p>
        ) : !preview.valid ? (
          <>
            <h1 className="text-lg font-semibold text-white">
              {preview.accepted ? 'This invite has already been used' : preview.expired ? 'This invite has expired' : 'This invite link is not valid'}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Ask the person who invited you to send a fresh link.
            </p>
            <Link href="/login" className="inline-block mt-6 text-sm underline" style={{ color: '#3B82F6' }}>Go to login</Link>
          </>
        ) : joined ? (
          <>
            <h1 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
              <CheckCircle size={18} style={{ color: '#10B981' }} /> You&apos;re in
            </h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Opening {preview.orgName}&apos;s dashboard…
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-white">Join {preview.orgName} on Naviio</h1>
            <p className="text-sm mt-2 mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              You&apos;ve been invited to {preview.orgName}&apos;s live financials — P&amp;L, cash flow,
              and every number traceable to the transactions behind it.
              <br />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Invite issued to {preview.email}</span>
            </p>

            {me ? (
              <>
                <button
                  onClick={accept}
                  disabled={accepting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ backgroundColor: '#3B82F6', color: '#fff', boxShadow: '0 0 24px rgba(59,130,246,0.3)' }}
                >
                  {accepting ? 'Joining…' : `Accept invite as ${me.email}`}
                </button>
                {error && (
                  <p className="flex items-center justify-center gap-1.5 text-xs mt-3" style={{ color: '#F59E0B' }}>
                    <AlertTriangle size={12} /> {error}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Link
                  href={`/register?next=${encodeURIComponent(next)}`}
                  className="block w-full px-6 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: '#3B82F6', color: '#fff' }}
                >
                  Create an account to accept
                </Link>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Already have one?{' '}
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline" style={{ color: '#3B82F6' }}>
                    Log in
                  </Link>
                  {' '}with {preview.email}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
