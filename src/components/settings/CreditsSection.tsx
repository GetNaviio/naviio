'use client'

/**
 * Credits & Billing section (Settings → Billing tab). Live balance, a one-click
 * $10 reload (Stripe Checkout), what each metered feature costs, and the full
 * usage history (the append-only credit ledger). Balance + history come from one
 * round-trip to /api/credits/history.
 *
 * The buy flow redirects to Stripe and returns to /settings (?credits=success),
 * where we confirm the session directly (webhook-independent) and refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { Wallet, Zap, RefreshCw, ArrowUpRight, ArrowDownRight, CheckCircle, Loader2 } from 'lucide-react'
import { FEATURE_COST, CREDIT_PACKS } from '@/lib/credits/rates'

interface Entry {
  id: string
  delta: number
  balanceAfter: number
  reason: string
  feature: string | null
  isPurchase: boolean
  createdAt: string
}

const PACK = CREDIT_PACKS[0] // single $10 / 100-credit reload

const FEATURE_LABEL: Record<string, string> = {
  navi_message: 'Navi message',
  plaid_sync: 'Bank sync',
  realtime_refresh: 'Real-time refresh',
  commentary: 'AI commentary',
  dev_adjust: 'Manual adjustment',
}
const REASON_LABEL: Record<string, string> = {
  purchase: 'Top-up',
  grant: 'Grant',
  charge: 'Usage',
  refund: 'Refund',
}

const COST_ROWS: { feature: keyof typeof FEATURE_COST; label: string; note: string }[] = [
  { feature: 'navi_message', label: 'Navi message', note: 'Each question you ask the AI co-pilot' },
  { feature: 'plaid_sync', label: 'Bank sync', note: 'On-demand pull of new bank activity' },
  { feature: 'realtime_refresh', label: 'Real-time refresh', note: 'Force-fresh bank data right now' },
  { feature: 'commentary', label: 'AI commentary', note: 'Written analysis of your financials' },
]

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function CreditsSection() {
  const [balance, setBalance] = useState<number | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/credits/history?limit=100')
      if (r.ok) {
        const d = await r.json()
        setBalance(d.balance ?? 0)
        setEntries(d.entries ?? [])
      }
    } catch { /* leave prior state */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 6000)
    return () => clearTimeout(t)
  }, [banner])

  useEffect(() => {
    load()
    // Returning from Stripe Checkout — confirm directly (webhook-independent),
    // then refresh. Strip the params so a reload doesn't re-confirm.
    const params = new URLSearchParams(window.location.search)
    const status = params.get('credits')
    if (status === 'success') {
      setBanner({ kind: 'ok', text: 'Payment received — credits added.' })
      const sessionId = params.get('session_id')
      // Preserve the #billing hash so the user stays on this tab after the strip.
      window.history.replaceState(null, '', window.location.pathname + '#billing')
      if (sessionId) {
        fetch('/api/credits/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).then(() => load()).catch(() => {})
      }
    } else if (status === 'cancel') {
      setBanner({ kind: 'err', text: 'Checkout canceled — no charge was made.' })
      window.history.replaceState(null, '', window.location.pathname + '#billing')
    }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) load() }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [load])

  const buy = async () => {
    setBuying(true); setBanner(null)
    try {
      const r = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPath: '/settings' }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.url) window.location.href = d.url // same-tab hosted Checkout
      else { setBanner({ kind: 'err', text: d.error ?? 'Could not start checkout.' }); setBuying(false) }
    } catch {
      setBanner({ kind: 'err', text: 'Could not start checkout.' }); setBuying(false)
    }
  }

  const low = balance != null && balance <= 5

  return (
    <div className="space-y-4 sm:space-y-6">
      {banner && (
        <div
          className="px-3 py-2.5 rounded-lg flex items-center gap-2 text-sm"
          style={{
            backgroundColor: banner.kind === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${banner.kind === 'ok' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.3)'}`,
            color: banner.kind === 'ok' ? '#10B981' : '#F59E0B',
          }}
        >
          {banner.kind === 'ok' ? <CheckCircle size={15} /> : <Zap size={15} />}
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Current balance" tooltip="Credits are spent as you use metered features. Top up any time — they never expire.">
          <div className="flex items-end gap-2">
            <Wallet size={28} style={{ color: low ? '#F59E0B' : '#00C49F' }} />
            <span className="text-4xl font-bold leading-none" style={{ color: 'var(--color-text-primary)' }}>
              {loading ? '—' : balance}
            </span>
            <span className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>credits</span>
          </div>
          {low && !loading && (
            <p className="text-xs mt-2" style={{ color: '#F59E0B' }}>
              {balance === 0 ? "You're out of credits — top up to keep using metered features." : 'Running low — consider topping up.'}
            </p>
          )}
        </Card>

        <Card title="Reload" subtitle={`$${(PACK.priceCents / 100).toFixed(0)} for ${PACK.credits} credits`} tooltip="Secure one-time payment via Stripe. Credits land on your balance instantly after payment.">
          <button
            onClick={buy}
            disabled={buying}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#00C49F', color: '#04221C' }}
          >
            {buying ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {buying ? 'Starting checkout…' : `Buy ${PACK.credits} credits — $${(PACK.priceCents / 100).toFixed(0)}`}
          </button>
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
            ${(PACK.priceCents / 100 / PACK.credits).toFixed(2)} per credit · never expires
          </p>
        </Card>

        <Card title="What credits cost" tooltip="The credit price of each metered action. Reading reports and dashboards is always free.">
          <ul className="space-y-1.5">
            {COST_ROWS.map((row) => (
              <li key={row.feature} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--color-text-secondary)' }} title={row.note}>{row.label}</span>
                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {FEATURE_COST[row.feature]} {FEATURE_COST[row.feature] === 1 ? 'credit' : 'credits'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Usage history"
        subtitle={loading ? 'Loading…' : `${entries.length} most recent`}
        padding={false}
        action={
          <button onClick={() => { setLoading(true); load() }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={11} /> Refresh
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>When</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Activity</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Type</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Change</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {loading ? 'Loading…' : 'No credit activity yet. Buy credits to get started.'}
                </td></tr>
              ) : (
                entries.map((e, i) => {
                  const positive = e.delta >= 0
                  const label = e.feature ? (FEATURE_LABEL[e.feature] ?? e.feature) : (REASON_LABEL[e.reason] ?? e.reason)
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--color-surface-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-surface-bg)' }}>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.createdAt)}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</td>
                      <td className="px-4 py-3">
                        <Badge variant={positive ? 'success' : 'neutral'} size="sm">{REASON_LABEL[e.reason] ?? e.reason}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: positive ? '#10B981' : 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {positive ? '+' : ''}{e.delta}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{e.balanceAfter}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
