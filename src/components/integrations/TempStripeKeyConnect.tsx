'use client'

/**
 * ⚠️ TEMPORARY — sandbox testing only. DELETE THIS FILE when done.
 *
 * Connects Stripe by pasting a restricted/secret test key directly (POST
 * /api/auth/stripe), bypassing the OAuth flow. This exists ONLY so we can point
 * Naviio at the seeded sandbox account (where the test data lives) to verify the
 * metric cards — OAuth connects a *different*, empty account. Real users use OAuth.
 *
 * Guards so this can never leak to production:
 *   - Only rendered when NEXT_PUBLIC_STRIPE_KEY_CONNECT === '1'.
 *   - Accepts test keys only (rk_test_ / sk_test_); refuses live keys client-side.
 *
 * Scheduled for removal — see docs/decisions or the scheduled task. To remove:
 * delete this file, its import + render block in integrations/page.tsx, and the
 * NEXT_PUBLIC_STRIPE_KEY_CONNECT env var.
 */
import { useState } from 'react'
import { FlaskConical } from 'lucide-react'

export default function TempStripeKeyConnect({ onConnected }: { onConnected: (msg: string, ok: boolean) => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  async function connect() {
    const k = key.trim()
    if (!(k.startsWith('rk_test_') || k.startsWith('sk_test_'))) {
      onConnected('Use a TEST key (rk_test_… or sk_test_…).', false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/stripe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: k }),
      })
      if (res.ok) { setKey(''); onConnected('Stripe sandbox connected (test key)', true) }
      else { const d = await res.json().catch(() => ({})); onConnected(d.error || 'Could not connect that key', false) }
    } catch { onConnected('Network error connecting Stripe', false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px dashed #F59E0B' }}>
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical size={14} style={{ color: '#F59E0B' }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#F59E0B' }}>Test only · paste a Stripe sandbox key</span>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Bypasses OAuth to read the seeded sandbox account directly. Test keys only — this control is removed before launch.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="password"
          placeholder="sk_test_… or rk_test_…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
          aria-label="Stripe test key"
        />
        <button
          onClick={connect}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
          style={{ backgroundColor: '#F59E0B', color: '#1A1A1A' }}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
