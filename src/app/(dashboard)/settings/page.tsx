'use client'

import { useState, useEffect } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import TeamSection from '@/components/settings/TeamSection'
import PortalSection from '@/components/settings/PortalSection'
import BrandingSection from '@/components/settings/BrandingSection'
import CreditsSection from '@/components/settings/CreditsSection'
import { Shield, ShieldCheck, ShieldOff, Smartphone, Copy, CheckCircle, AlertTriangle, KeyRound, Trash2, Building2, Wallet, Share2, UserCog } from 'lucide-react'

type SettingsTab = 'organization' | 'billing' | 'sharing' | 'security' | 'account'
const TABS: { id: SettingsTab; label: string; icon: typeof Shield }[] = [
  { id: 'organization', label: 'Organization',      icon: Building2 },
  { id: 'billing',      label: 'Billing & Credits', icon: Wallet },
  { id: 'sharing',      label: 'Sharing',           icon: Share2 },
  { id: 'security',     label: 'Security',          icon: Shield },
  { id: 'account',      label: 'Account',           icon: UserCog },
]
const TAB_IDS = TABS.map((t) => t.id) as string[]

interface Passkey { id: string; name: string | null; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null }

type Step = 'idle' | 'qr' | 'verify' | 'backup' | 'enabled'

export default function SettingsPage() {
  const [step,         setStep]         = useState<Step>('idle')
  const [qrCode,       setQrCode]       = useState('')
  const [secret,       setSecret]       = useState('')
  const [code,         setCode]         = useState('')
  const [backupCodes,  setBackupCodes]  = useState<string[]>([])
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [mfaEnabled,   setMfaEnabled]   = useState(false)
  const [disablePw,    setDisablePw]    = useState('')
  const [disableCode,  setDisableCode]  = useState('')
  const [showDisable,  setShowDisable]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [passkeys,     setPasskeys]     = useState<Passkey[]>([])
  const [passkeyBusy,  setPasskeyBusy]  = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [tab,          setTab]          = useState<SettingsTab>('organization')

  // Pick the initial tab after mount (avoids SSR/client hash mismatch): a
  // returning Stripe Checkout (?credits=…) lands on Billing; otherwise honor the
  // #hash so a tab is linkable and survives reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('credits')) { setTab('billing'); return }
    const hash = window.location.hash.replace('#', '')
    if (TAB_IDS.includes(hash)) setTab(hash as SettingsTab)
  }, [])

  function selectTab(id: SettingsTab) {
    setTab(id)
    window.history.replaceState(null, '', `#${id}`)
  }

  async function loadPasskeys() {
    try {
      const res = await fetch('/api/auth/webauthn/credentials')
      if (res.ok) setPasskeys((await res.json()).credentials ?? [])
    } catch { /* ignore */ }
  }
  useEffect(() => { loadPasskeys() }, [])

  async function addPasskey() {
    setPasskeyBusy(true); setPasskeyError('')
    try {
      const optRes = await fetch('/api/auth/webauthn/register/options', { method: 'POST' })
      if (!optRes.ok) {
        const data = await optRes.json().catch(() => ({}))
        throw new Error(data.error || `Could not start passkey registration (HTTP ${optRes.status})`)
      }
      const optionsJSON = await optRes.json()
      const attResp = await startRegistration({ optionsJSON })
      const verRes = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      })
      if (!verRes.ok) throw new Error((await verRes.json().catch(() => ({}))).error || 'Passkey registration failed')
      await loadPasskeys()
    } catch (e) {
      const msg = (e as Error).message
      // User-cancelled prompts throw NotAllowedError — don't surface as an error.
      if (!/NotAllowed|AbortError|cancel/i.test(msg)) setPasskeyError(msg)
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function removePasskey(id: string) {
    if (!confirm('Remove this passkey?')) return
    try {
      await fetch(`/api/auth/webauthn/credentials?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await loadPasskeys()
    } catch { /* ignore */ }
  }

  async function startSetup() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/mfa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setQrCode(data.qrCode)
      setSecret(data.secret)
      setStep('qr')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function enableMfa() {
    if (code.replace(/\s/g, '').length !== 6) { setError('Enter the 6-digit code from your app'); return }
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/mfa/enable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBackupCodes(data.backupCodes)
      setStep('backup')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function disableMfa() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/mfa/disable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: disablePw, code: disableCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMfaEnabled(false); setShowDisable(false)
      setDisablePw(''); setDisableCode(''); setStep('idle')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function finishSetup() { setMfaEnabled(true); setStep('enabled') }

  async function deleteAccount() {
    setDeleting(true); setError('')
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete account')
      }
      // Session is cleared server-side — send the user to login.
      window.location.href = '/login'
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div>
      <Header title="Settings" subtitle="Organization, billing, sharing, and security" />

      <div className="p-4 sm:p-6">
        {/* ── Sub-navigation ──
            Mobile: tabs wrap into pills so every tab stays visible (no sideways
            scroll that can hide Security/Account). Desktop: classic underline row. */}
        <nav className="flex flex-wrap gap-2 sm:gap-1 mb-6 sm:flex-nowrap sm:overflow-x-auto sm:border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => selectTab(id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium whitespace-nowrap rounded-lg sm:rounded-none border sm:border-0 sm:border-b-2 transition-colors ${active ? 'bg-[rgba(59,130,246,0.12)] sm:bg-transparent' : 'bg-transparent'}`}
                style={{
                  color: active ? 'var(--color-info)' : 'var(--color-text-secondary)',
                  borderColor: active ? 'var(--color-info)' : 'transparent',
                  marginBottom: -1,
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className={`${tab === 'billing' ? 'max-w-4xl' : 'max-w-2xl'} space-y-6`}>

        {/* ── Organization: team & entities ── */}
        {tab === 'organization' && <TeamSection />}

        {/* ── Billing & credits ── */}
        {tab === 'billing' && <CreditsSection />}

        {/* ── Sharing: client portal + white-label branding ── */}
        {tab === 'sharing' && (
          <>
            <PortalSection />
            <BrandingSection />
          </>
        )}

        {/* ── Security: 2FA + passkeys ── */}
        {tab === 'security' && (
          <>
        {/* MFA status banner */}
        <div
          className="flex items-center gap-4 px-5 py-4 rounded-xl"
          style={{
            backgroundColor: mfaEnabled ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${mfaEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
          }}
        >
          {mfaEnabled
            ? <ShieldCheck size={22} style={{ color: '#10B981', flexShrink: 0 }} />
            : <AlertTriangle size={22} style={{ color: '#F59E0B', flexShrink: 0 }} />
          }
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {mfaEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is not enabled'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {mfaEnabled
                ? 'Your account is protected with an authenticator app. You will be prompted for a code at each login.'
                : 'Add an extra layer of security. You will need your authenticator app each time you sign in.'}
            </p>
          </div>
        </div>

        {/* ── Step: idle (not set up) ── */}
        {step === 'idle' && !mfaEnabled && (
          <Card title="Set Up Authenticator App" subtitle="Use Google Authenticator, Authy, or 1Password" tooltip="TOTP-based MFA generates a new 6-digit code every 30 seconds. Even if your password is compromised, an attacker cannot log in without physical access to your device.">
            <div className="space-y-4">
              <div className="space-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--color-info)' }}>1</span>
                  <span>Install an authenticator app on your phone (Google Authenticator, Authy, or 1Password).</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--color-info)' }}>2</span>
                  <span>Scan the QR code that appears with your app.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--color-info)' }}>3</span>
                  <span>Enter the 6-digit code from the app to confirm setup.</span>
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                onClick={startSetup}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-info)' }}
              >
                <Smartphone size={15} />
                {loading ? 'Generating…' : 'Set Up Two-Factor Authentication'}
              </button>
            </div>
          </Card>
        )}

        {/* ── Step: QR code display ── */}
        {step === 'qr' && (
          <Card title="Scan QR Code" subtitle="Open your authenticator app and scan this code">
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="p-3 rounded-xl bg-white inline-block shadow-sm">
                  <img src={qrCode} alt="MFA QR code" width={200} height={200} />
                </div>
              </div>

              <div>
                <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Can&apos;t scan? Enter this code manually in your app:
                </p>
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg font-mono text-xs"
                  style={{ backgroundColor: 'var(--color-surface-bg)', border: '1px solid var(--color-surface-border)' }}
                >
                  <span style={{ color: 'var(--color-text-primary)', letterSpacing: '0.1em' }}>{secret}</span>
                  <button onClick={copySecret} className="ml-2 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {copied ? <CheckCircle size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep('verify')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
                style={{ backgroundColor: 'var(--color-info)' }}
              >
                I&apos;ve scanned the code — Continue
              </button>
            </div>
          </Card>
        )}

        {/* ── Step: Verify code ── */}
        {step === 'verify' && (
          <Card title="Verify Your Authenticator" subtitle="Enter the 6-digit code shown in your app">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Authentication Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="000 000"
                  value={code}
                  onChange={e => { setCode(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && enableMfa()}
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg text-center text-2xl font-mono tracking-[0.3em] outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface-bg)',
                    border: `1px solid ${error ? '#EF4444' : 'var(--color-surface-border)'}`,
                    color: 'var(--color-text-primary)',
                  }}
                />
                {error && <p className="text-xs mt-1.5" style={{ color: '#EF4444' }}>{error}</p>}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('qr'); setError('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                >
                  Back
                </button>
                <button
                  onClick={enableMfa}
                  disabled={loading || code.replace(/\s/g, '').length !== 6}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-info)' }}
                >
                  {loading ? 'Verifying…' : 'Verify & Enable'}
                </button>
              </div>

              <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                Codes rotate every 30 seconds. Make sure your device clock is accurate.
              </p>
            </div>
          </Card>
        )}

        {/* ── Step: Backup codes ── */}
        {step === 'backup' && (
          <Card title="Save Your Backup Codes" subtitle="Store these somewhere safe — you'll need them if you lose your device">
            <div className="space-y-4">
              <div
                className="p-1 rounded-lg"
                style={{ backgroundColor: 'var(--color-surface-bg)', border: '1px solid var(--color-surface-border)' }}
              >
                <div className="grid grid-cols-2 gap-px">
                  {backupCodes.map((code, i) => (
                    <div key={i} className="px-4 py-2.5 font-mono text-sm text-center" style={{ color: 'var(--color-text-primary)' }}>
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg text-xs"
                style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}
              >
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Each backup code can only be used once. Store them in a password manager. Naviio cannot recover these codes.</span>
              </div>

              <button
                onClick={finishSetup}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#10B981' }}
              >
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle size={15} /> I&apos;ve saved my backup codes
                </span>
              </button>
            </div>
          </Card>
        )}

        {/* ── Step: MFA active ── */}
        {(step === 'enabled' || mfaEnabled) && !showDisable && (
          <Card title="Two-Factor Authentication" subtitle="Your account is secured with an authenticator app">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Shield size={18} style={{ color: '#10B981' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Authenticator app connected</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Google Authenticator / Authy / 1Password</p>
                </div>
              </div>

              <button
                onClick={() => { setShowDisable(true); setError('') }}
                className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                style={{ color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <ShieldOff size={13} /> Remove two-factor authentication
              </button>
            </div>
          </Card>
        )}

        {/* ── Disable MFA confirmation ── */}
        {showDisable && (
          <Card title="Remove Two-Factor Authentication" subtitle="Confirm your password and current authenticator code">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                <input
                  type="password"
                  value={disablePw}
                  onChange={e => setDisablePw(e.target.value)}
                  placeholder="Your current password"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-surface-bg)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value)}
                  placeholder="000000"
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tracking-widest outline-none"
                  style={{ backgroundColor: 'var(--color-surface-bg)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
              {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDisable(false); setError('') }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={disableMfa}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#EF4444' }}
                >
                  {loading ? 'Removing…' : 'Remove MFA'}
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Passkeys (WebAuthn) ── */}
        <Card title="Passkeys" subtitle="Sign in with Face ID, Touch ID, or a security key — phishing-resistant and counts as two-factor">
          <div className="space-y-3">
            {passkeys.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                No passkeys yet. Add one to sign in without a code — it satisfies the two-factor requirement on its own.
              </p>
            ) : (
              <div className="space-y-2">
                {passkeys.map((pk) => (
                  <div key={pk.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
                    <KeyRound size={15} style={{ color: '#3B82F6', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{pk.name || 'Passkey'}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Added {new Date(pk.createdAt).toLocaleDateString()}
                        {pk.lastUsedAt ? ` · last used ${new Date(pk.lastUsedAt).toLocaleDateString()}` : ''}
                        {pk.backedUp ? ' · synced' : ''}
                      </p>
                    </div>
                    <button onClick={() => removePasskey(pk.id)} aria-label="Remove passkey" style={{ color: 'var(--color-text-muted)' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={addPasskey}
              disabled={passkeyBusy}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ backgroundColor: '#3B82F6', color: '#fff' }}
            >
              {passkeyBusy ? 'Waiting for authenticator…' : 'Add a passkey'}
            </button>
            {passkeyError && (
              <p className="text-xs" style={{ color: '#EF4444' }}>{passkeyError}</p>
            )}
          </div>
        </Card>
          </>
        )}

        {/* ── Account: danger zone (SEC-POL-003 §5) ── */}
        {tab === 'account' && (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} style={{ color: '#EF4444' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#EF4444' }}>Delete account</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Permanently delete your account and all associated data. Access is disabled immediately, all bank and integration connections are revoked, and your financial data is permanently erased within 30 days. This cannot be undone.
          </p>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ backgroundColor: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,0.5)' }}
            >
              Delete my account
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-white">Are you sure? This is permanent.</span>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: '#EF4444', color: '#fff' }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        )}

        </div>
      </div>
    </div>
  )
}
