'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'

const COST = 3 // credits — keep in sync with FEATURE_COST.realtime_refresh

/**
 * Paid real-time refresh control. Shows the live credit balance, charges 3
 * credits to pull fresh bank data on demand, and prompts to buy credits when the
 * balance is too low. The free daily sync is unaffected — this is the upgrade.
 */
export default function RefreshNowButton() {
  const [balance, setBalance] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Auto-dismiss any status message after a few seconds.
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  const loadBalance = async (): Promise<number | null> => {
    try {
      const r = await fetch('/api/credits/balance')
      if (r.ok) {
        const b = (await r.json()).balance
        setBalance(b)
        return b
      }
    } catch { /* ignore */ }
    return null
  }
  useEffect(() => {
    loadBalance()
    // Returning from Stripe Checkout: the webhook credits asynchronously and may
    // not have landed by the time we redirect back, so poll briefly for it.
    const params = new URLSearchParams(window.location.search)
    if (params.get('credits') === 'success') {
      setMsg({ kind: 'ok', text: 'Payment received — credits added.' })
      const sessionId = params.get('session_id')
      // Strip the checkout params so a reload doesn't re-show this or re-confirm.
      window.history.replaceState(null, '', window.location.pathname)
      // Confirm the session directly (works even if the webhook didn't arrive),
      // then poll briefly as a backup in case the webhook lands first.
      if (sessionId) {
        fetch('/api/credits/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
          .then((r) => r.json())
          .then((d) => { if (typeof d.balance === 'number') setBalance(d.balance) })
          .catch(() => {})
      }
      let tries = 0
      const iv = setInterval(async () => {
        tries++
        await loadBalance()
        if (tries >= 6) clearInterval(iv)
      }, 1500)
      // Also refresh balance whenever the user returns to this tab (e.g. after
      // paying in the Checkout tab).
      const onFocus = () => loadBalance()
      window.addEventListener('focus', onFocus)
      return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
    }
    // Refresh balance on tab focus so credits bought in the Checkout tab show up.
    const onFocus = () => loadBalance()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const reload = async () => {
    try {
      const r = await fetch('/api/credits/checkout', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.url) window.location.href = d.url // same-tab hosted Checkout
      else setMsg({ kind: 'err', text: d.error ?? 'Could not start checkout.' })
    } catch {
      setMsg({ kind: 'err', text: 'Could not start checkout.' })
    }
  }

  const refresh = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/plaid/refresh', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.status === 402) {
        setBalance(d.balance ?? balance)
        setMsg({ kind: 'err', text: `Not enough credits — needs ${d.needed ?? COST}, you have ${d.balance ?? 0}.` })
      } else if (r.status === 400 && d.error === 'plaid_not_connected') {
        setMsg({ kind: 'err', text: 'Connect a bank in Integrations first.' })
      } else if (!r.ok) {
        setMsg({ kind: 'err', text: 'Refresh failed — you were not charged.' })
        if (typeof d.balance === 'number') setBalance(d.balance)
      } else {
        if (typeof d.balance === 'number') setBalance(d.balance)
        const a = d.synced?.added ?? 0, m = d.synced?.modified ?? 0
        setMsg({ kind: 'ok', text: `Refreshed — ${a} new, ${m} updated. ${COST} credits used.` })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Refresh failed — you were not charged.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={refresh}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        style={{ backgroundColor: 'rgba(0,196,159,0.12)', color: '#00C49F', border: '1px solid rgba(0,196,159,0.35)' }}
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
        {busy ? 'Refreshing…' : `Real-time refresh · ${COST} credits`}
      </button>
      <span className="text-xs" style={{ color: balance === 0 ? '#F59E0B' : 'var(--color-text-muted)' }}>
        Balance: <strong>{balance ?? '—'}</strong> credits
      </span>
      {balance === 0 && (
        <button
          onClick={reload}
          className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors animate-pulse"
          style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.5)' }}
        >
          Out of credits — Reload $10
        </button>
      )}
      {msg && (
        <span className="text-xs" style={{ color: msg.kind === 'ok' ? '#10B981' : '#F59E0B' }}>{msg.text}</span>
      )}
    </div>
  )
}
