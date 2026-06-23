'use client'

/**
 * Firm plan picker + billing summary (Clients page). Shows the two GTM options,
 * the live client-org count, the estimated platform bill, and — for the SaaS
 * resale plan — Stripe Connect onboarding so the firm can charge its own clients.
 */
import { useEffect, useState, useCallback } from 'react'
import { Check, CreditCard, Banknote, Percent, ExternalLink } from 'lucide-react'

type Cycle = 'monthly' | 'annual'
interface PlanDef {
  id: 'white_label' | 'white_label_saas'
  label: string
  baseFeeCents: number
  annualBaseFeeCents: number
  includedOrgs: number
  overagePerOrgCents: number
  commissionPct: number
  chargesClients: boolean
}
interface Bill {
  baseFeeCents: number
  overageOrgs: number
  overageCents: number
  platformDueCents: number
  effectiveMonthlyCents: number
}
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function BillingSection() {
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [current, setCurrent] = useState<PlanDef['id'] | null>(null)
  const [orgCount, setOrgCount] = useState(0)
  const [bill, setBill] = useState<Bill | null>(null)
  const [connectStatus, setConnectStatus] = useState<string>('none')
  const [connectErr, setConnectErr] = useState('')
  // Default to the safe/locked direction (false) so we never flash an enabled
  // billing state before the real status loads.
  const [billingConfigured, setBillingConfigured] = useState(false)
  const [priceConfigured, setPriceConfigured] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState(false)
  const [subStatus, setSubStatus] = useState<string>('none')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/firm/billing')
    const data = await res.json()
    setPlans(data.plans ?? [])
    setCurrent(data.current?.plan ?? null)
    setOrgCount(data.orgCount ?? 0)
    setBill(data.bill ?? null)
    setConnectStatus(data.connectStatus ?? 'none')
    setBillingConfigured(data.billingConfigured ?? false)
    setPriceConfigured(data.priceConfiguredForPlan ?? false)
    setSubscriptionActive(data.subscriptionActive ?? false)
    setSubStatus(data.subscriptionStatus ?? 'none')
    setCycle(data.cycle ?? 'monthly')
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Confirm a returned Checkout session (webhook-independent), then clean the URL.
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (params.get('billing') === 'active' && sessionId) {
      fetch(`/api/firm/billing/confirm?session_id=${encodeURIComponent(sessionId)}`)
        .catch(() => {})
        .finally(() => {
          window.history.replaceState(null, '', '/clients')
          load()
        })
    } else {
      load()
    }
  }, [load])

  async function activateBilling() {
    setBusy(true)
    try {
      const res = await fetch('/api/firm/billing/subscribe', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
    } finally {
      setBusy(false)
    }
  }

  async function patch(payload: { plan?: PlanDef['id']; cycle?: Cycle }) {
    setBusy(true)
    try {
      await fetch('/api/firm/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }
  const selectPlan = (plan: PlanDef['id']) => patch({ plan })
  const setBillingCycle = (c: Cycle) => {
    setCycle(c)
    patch({ cycle: c })
  }

  async function startConnect() {
    setBusy(true)
    setConnectErr('')
    try {
      const res = await fetch('/api/firm/connect', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) { window.location.href = data.url; return }
      // Surface the reason instead of failing silently (e.g. Stripe Connect not
      // enabled on the platform account → "Could not start Stripe onboarding").
      setConnectErr(data.error || 'Could not start Stripe onboarding. Make sure Stripe Connect is enabled on your Stripe account.')
    } catch {
      setConnectErr('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const card = { backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }

  // Until /api/firm/billing resolves, show a neutral placeholder instead of the
  // default state (which would flash "0 clients active" and an enabled billing UI).
  if (!loaded) {
    return (
      <div className="rounded-xl border p-5 mb-6" style={card}>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard size={16} style={{ color: 'var(--color-info)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
        </div>
        <p className="text-xs animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading billing…</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-5 mb-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} style={{ color: 'var(--color-info)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {orgCount} client {orgCount === 1 ? 'org' : 'orgs'} active
          {bill && current
            ? ` · ${usd(bill.platformDueCents)}/${cycle === 'annual' ? 'yr' : 'mo'}` +
              (cycle === 'annual' ? ` (${usd(bill.effectiveMonthlyCents)}/mo)` : '')
            : ''}
        </p>
        {/* Monthly / annual toggle */}
        <div className="inline-flex rounded-lg border p-0.5 text-xs" style={{ borderColor: 'var(--color-surface-border)' }}>
          {(['monthly', 'annual'] as Cycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setBillingCycle(c)}
              disabled={busy}
              className="px-2.5 py-1 rounded-md font-medium capitalize"
              style={{
                backgroundColor: cycle === c ? 'var(--color-info)' : 'transparent',
                color: cycle === c ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {c}
              {c === 'annual' ? ' · 2 mo free' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {plans.map((p) => {
          const active = current === p.id
          return (
            <div
              key={p.id}
              className="rounded-lg border p-4"
              style={{
                borderColor: active ? 'var(--color-info)' : 'var(--color-surface-border)',
                backgroundColor: active ? 'rgba(59,130,246,0.06)' : 'transparent',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.label}</span>
                {active && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--color-info)' }}>
                    <Check size={12} /> Current
                  </span>
                )}
              </div>
              <p className="text-2xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {cycle === 'annual' ? usd(p.annualBaseFeeCents) : usd(p.baseFeeCents)}
                <span className="text-sm font-normal" style={{ color: 'var(--color-text-secondary)' }}>
                  /{cycle === 'annual' ? 'yr' : 'mo'}
                </span>
                {cycle === 'annual' && (
                  <span className="block text-xs font-normal" style={{ color: 'var(--color-success)' }}>
                    {usd(Math.round(p.annualBaseFeeCents / 12))}/mo · 2 months free
                  </span>
                )}
              </p>
              <ul className="text-xs space-y-1 mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                <li className="flex items-center gap-1.5"><Banknote size={12} /> Up to {p.includedOrgs} client orgs, then {usd(p.overagePerOrgCents)}/org</li>
                {p.chargesClients ? (
                  <li className="flex items-center gap-1.5"><Percent size={12} /> Resell to clients · Naviio takes {p.commissionPct}%</li>
                ) : (
                  <li className="flex items-center gap-1.5"><Percent size={12} /> You absorb the cost — clients pay nothing</li>
                )}
              </ul>
              {!active && (
                <button
                  onClick={() => selectPlan(p.id)}
                  disabled={busy}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--color-info)', opacity: busy ? 0.7 : 1 }}
                >
                  {current ? 'Switch to this plan' : 'Choose this plan'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Activate / status of the platform subscription */}
      {current && (
        <div className="mt-4 rounded-lg border p-3 flex items-center justify-between" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Platform subscription</p>
            <p className="text-xs" style={{ color: subStatus === 'past_due' || subStatus === 'unpaid' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
              {subscriptionActive
                ? `Active — ${bill ? usd(bill.platformDueCents) : ''}/${cycle === 'annual' ? 'yr' : 'mo'}, adjusts automatically as you add clients.`
                : subStatus === 'past_due' || subStatus === 'unpaid'
                  ? 'Payment past due — update your card to keep access.'
                  : subStatus === 'canceled'
                    ? 'Subscription canceled. Reactivate to continue.'
                    : priceConfigured
                      ? 'Add a payment method to start your subscription.'
                      : 'Pricing isn’t configured on the server yet.'}
            </p>
          </div>
          {subscriptionActive ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-success)' }}>
              <Check size={13} /> Active
            </span>
          ) : (
            <button
              onClick={activateBilling}
              disabled={busy || !billingConfigured || !priceConfigured}
              className="text-sm font-medium px-3 py-2 rounded-lg text-white whitespace-nowrap"
              style={{ backgroundColor: 'var(--color-info)', opacity: busy || !billingConfigured || !priceConfigured ? 0.6 : 1 }}
            >
              {subStatus === 'past_due' || subStatus === 'unpaid' ? 'Update payment' : subStatus === 'canceled' ? 'Reactivate' : 'Activate billing'}
            </button>
          )}
        </div>
      )}

      {/* Connect onboarding for the resale plan */}
      {current === 'white_label_saas' && (
        <div className="mt-4 rounded-lg border p-3 flex items-center justify-between" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Client payments</p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {connectStatus === 'enabled'
                ? 'Connected — clients can pay you; Naviio keeps its commission automatically.'
                : 'Connect Stripe so your clients can pay you, with Naviio’s commission taken automatically.'}
            </p>
          </div>
          {connectStatus !== 'enabled' && (
            <button
              onClick={startConnect}
              disabled={busy || !billingConfigured}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white whitespace-nowrap"
              style={{ backgroundColor: 'var(--color-info)', opacity: busy || !billingConfigured ? 0.6 : 1 }}
            >
              <ExternalLink size={14} /> {connectStatus === 'pending' ? 'Finish setup' : 'Connect Stripe'}
            </button>
          )}
        </div>
      )}
      {current === 'white_label_saas' && connectErr && (
        <p className="text-xs mt-2 px-1" style={{ color: 'var(--color-danger)' }}>{connectErr}</p>
      )}
      {!billingConfigured && (
        <p className="text-[11px] mt-3" style={{ color: 'var(--color-text-secondary)' }}>
          Plan selection is saved; live charging activates once billing keys are configured on the server.
        </p>
      )}
    </div>
  )
}
