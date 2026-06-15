'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'

function MfaForm() {
  const params = useSearchParams()
  const errorCode = params.get('error')
  const [passkeyError, setPasskeyError] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  const errorMsg =
    passkeyError ? passkeyError :
    errorCode === 'code' ? 'Invalid or expired code. Try again.' :
    errorCode === 'missing' ? 'Enter the 6-digit code from your authenticator app.' :
    null

  async function signInWithPasskey() {
    setPasskeyBusy(true); setPasskeyError('')
    try {
      const optRes = await fetch('/api/auth/webauthn/authenticate/options', { method: 'POST' })
      if (!optRes.ok) throw new Error((await optRes.json().catch(() => ({}))).error || 'No passkey available')
      const optionsJSON = await optRes.json()
      const asseResp = await startAuthentication({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asseResp),
      })
      if (!verRes.ok) throw new Error((await verRes.json().catch(() => ({}))).error || 'Passkey sign-in failed')
      window.location.href = '/dashboard'
    } catch (e) {
      const msg = (e as Error).message
      if (!/NotAllowed|AbortError|cancel/i.test(msg)) setPasskeyError(msg)
      setPasskeyBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#060D1F' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <img src="/naviio-logo.png" alt="Naviio" className="h-20 w-auto" style={{ maxWidth: 340 }} />
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Two-factor authentication</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>

        {errorMsg && (
          <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            {errorMsg}
          </div>
        )}

        {/* Native form POST — verify route sets the session cookie and redirects */}
        <form action="/api/auth/mfa/verify" method="POST" className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Verification code
            </label>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none transition-all tracking-[0.4em] text-center"
              style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' }}
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all mt-2"
            style={{ backgroundColor: '#3B82F6' }}
          >
            Verify and continue
          </button>
        </form>

        {/* Passkey alternative */}
        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
        </div>
        <button
          type="button"
          onClick={signInWithPasskey}
          disabled={passkeyBusy}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'transparent', color: '#fff', border: '1px solid var(--color-surface-border)' }}
        >
          {passkeyBusy ? 'Waiting for passkey…' : 'Use a passkey'}
        </button>

        <p className="text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>
          Lost access to your authenticator?{' '}
          <Link href="/login" className="font-medium" style={{ color: '#3B82F6' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function MfaChallengePage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  )
}
