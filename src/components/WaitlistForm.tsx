'use client'

import { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

/**
 * Landing-page waitlist signup. Submits the email to POST /api/waitlist and
 * shows inline confirmation. Critically, the submit handler calls
 * preventDefault() so the page does NOT navigate/scroll (the old `<a href="#">`
 * button jumped to the top of the page instead of submitting).
 *
 * Reuses the global landing CSS classes (cta-input-row, cta-input, btn-primary).
 */
export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault() // stop the native form submit / page jump
    if (status === 'loading') return

    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className="cta-input-row" role="status" aria-live="polite" style={{ justifyContent: 'center' }}>
        <p style={{ color: 'var(--accent2)', fontSize: '1rem', fontWeight: 500 }}>
          🎉 You&rsquo;re on the list! We&rsquo;ll email {email} when the beta opens.
        </p>
      </div>
    )
  }

  return (
    <form className="cta-input-row" onSubmit={handleSubmit} noValidate aria-live="polite">
      <input
        className="cta-input"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="your@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'loading'}
        aria-label="Email address"
      />
      <button
        type="submit"
        className="btn-primary"
        disabled={status === 'loading'}
        style={{
          whiteSpace: 'nowrap',
          border: 'none',
          cursor: status === 'loading' ? 'default' : 'pointer',
          fontFamily: 'inherit',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
      >
        {status === 'loading' ? 'Joining…' : 'Join waitlist'}
      </button>
      {status === 'error' && (
        <p style={{ flexBasis: '100%', color: '#ff6b6b', fontSize: '0.85rem', marginTop: 4 }}>
          {message}
        </p>
      )}
    </form>
  )
}
