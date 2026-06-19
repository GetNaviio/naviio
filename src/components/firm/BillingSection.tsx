'use client'

/**
 * Firm plan picker + billing summary (Clients page). Shows the two GTM options,
 * the live client-org count, the estimated platform bill, and — for the SaaS
 * resale plan — Stripe Connect onboarding so the firm can charge its own clients.
 */
import { useEffect, useState, useCallback } from 'react'
import { Check, CreditCard, Banknote, Percent, ExternalLink } from 'lucide-react'

interface PlanDef {
  id: 'white_label' | 'white_label_saas'
  label: string
  baseFeeCents: number
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
}
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function BillingSection() {
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [current, setCurrent] = useState<PlanDef['id'] | null>(null)
  const [orgCount, setOrgCount] = useState(0)
  const [bill, setBill] = useState<Bill | null>(null)
  const [connectStatus, setConnectStatus] = useState<string>('none')
  const [billingConfigured, setBillingConfigured] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/firm/billing')
    const data = await res.json()
    setPlans(data.plans ?? [])
    setCurrent(data.current?.plan ?? null)
    setOrgCount(data.orgCount ?? 0)
    setBill(data.bill ?? null)
    setConnectStatus(data.connectStatus ?? 'none')
    setBillingConfigured(data.billingConfigured ?? false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function selectPlan(plan: PlanDef['id']) {
    setBusy(true)
    try {
      await fetch('/api/firm/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function startConnect() {
    setBusy(true)
    try {
      const res = await fetch('/api/firm/connect', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
    } finally {
      setBusy(false)
    }
  }

  const card = { backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }

  return (
    <div className="rounded-xl border p-5 mb-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} style={{ color: 'var(--color-info)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plan &amp; billing</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        {orgCount} client {orgCount === 1 ? 'org' : 'orgs'} active
        {bill && current ? ` · estimated platform bill ${usd(bill.platformDueCents)}/mo` : ''}
      </p>

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
                {usd(p.baseFeeCents)}<span className="text-sm font-normal" style={{ color: 'var(--color-text-secondary)' }}>/mo</span>
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
      {!billingConfigured && (
        <p className="text-[11px] mt-3" style={{ color: 'var(--color-text-secondary)' }}>
          Plan selection is saved; live charging activates once billing keys are configured on the server.
        </p>
      )}
    </div>
  )
}
