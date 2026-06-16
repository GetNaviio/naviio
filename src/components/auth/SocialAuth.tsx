'use client'

import { useState } from 'react'
import { KeyRound, Building2 } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

// Enterprise SSO is hidden until WorkOS is configured in production. Flip to
// true (and set WORKOS_* env vars) to re-enable the "Sign in/up with SSO" button.
const SSO_ENABLED = false

const ignorable = (msg: string) => /NotAllowed|AbortError|cancel/i.test(msg)
async function errText(res: Response, fallback: string) {
  return (await res.json().catch(() => ({}))).error || fallback
}

/**
 * Federated / passwordless sign-in options shared by the login and register
 * pages: Continue with Google, passkey (discoverable login or email signup), and
 * enterprise SSO (work email → WorkOS).
 */
export default function SocialAuth({ mode }: { mode: 'login' | 'register' }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ssoOpen, setSsoOpen] = useState(false)
  const [ssoEmail, setSsoEmail] = useState('')
  const [pkOpen, setPkOpen] = useState(false)
  const [pkEmail, setPkEmail] = useState('')

  const verb = mode === 'register' ? 'Sign up' : 'Sign in'

  async function passkey() {
    setError('')
    if (mode === 'register' && !pkOpen) { setPkOpen(true); return }
    setBusy('passkey')
    try {
      if (mode === 'login') {
        const optRes = await fetch('/api/auth/webauthn/login/options', { method: 'POST' })
        if (!optRes.ok) throw new Error(await errText(optRes, 'Passkey sign-in unavailable'))
        const optionsJSON = await optRes.json()
        const asseResp = await startAuthentication({ optionsJSON })
        const v = await fetch('/api/auth/webauthn/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asseResp) })
        if (!v.ok) throw new Error(await errText(v, 'Passkey sign-in failed'))
      } else {
        if (!pkEmail.includes('@')) { setError('Enter a valid email'); setBusy(null); return }
        const optRes = await fetch('/api/auth/webauthn/signup/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pkEmail }) })
        if (!optRes.ok) throw new Error(await errText(optRes, 'Could not start sign-up'))
        const optionsJSON = await optRes.json()
        const attResp = await startRegistration({ optionsJSON })
        const v = await fetch('/api/auth/webauthn/signup/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attResp) })
        if (!v.ok) throw new Error(await errText(v, 'Sign-up failed'))
      }
      window.location.href = '/dashboard'
    } catch (e) {
      const msg = (e as Error).message
      if (!ignorable(msg)) setError(msg)
    } finally {
      setBusy(null)
    }
  }

  function sso() {
    setError('')
    if (!ssoOpen) { setSsoOpen(true); return }
    if (ssoEmail.includes('@')) window.location.href = `/api/auth/sso?email=${encodeURIComponent(ssoEmail)}`
    else setError('Enter your work email')
  }

  const btn: React.CSSProperties = {
    backgroundColor: 'transparent', color: '#fff',
    border: '1px solid var(--color-surface-border)',
  }
  const input: React.CSSProperties = {
    backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)',
  }

  return (
    <div className="space-y-2.5">
      {/* Google */}
      <a
        href="/api/auth/google"
        className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all"
        style={btn}
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.2-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 16 3 9.1 7.6 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.9 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.3 15.9 45 24 45z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l6.3 5.3C39.9 36.5 44 31 44 24c0-1.2-.1-2.3-.4-3.5z"/>
        </svg>
        {verb} with Google
      </a>

      {/* Passkey */}
      {mode === 'register' && pkOpen && (
        <input
          type="email" value={pkEmail} onChange={(e) => setPkEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
          style={input}
        />
      )}
      <button
        type="button" onClick={passkey} disabled={busy === 'passkey'}
        className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all" style={btn}
      >
        <KeyRound size={16} />
        {busy === 'passkey' ? 'Waiting for passkey…' : `${verb} with a passkey`}
      </button>

      {/* SSO — hidden until WorkOS is configured (see SSO_ENABLED). */}
      {SSO_ENABLED && (
        <>
          {ssoOpen && (
            <input
              type="email" value={ssoEmail} onChange={(e) => setSsoEmail(e.target.value)}
              placeholder="you@company.com" onKeyDown={(e) => e.key === 'Enter' && sso()}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={input}
            />
          )}
          <button
            type="button" onClick={sso}
            className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all" style={btn}
          >
            {!ssoOpen && <Building2 size={16} />}
            {ssoOpen ? 'Continue' : `${verb} with SSO`}
          </button>
        </>
      )}

      {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  )
}
