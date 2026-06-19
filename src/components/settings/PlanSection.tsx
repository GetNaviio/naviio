'use client'

/**
 * Plan & subscription (Settings → Billing). Shows the Naviio plans, the org's
 * current plan + entity usage, a monthly/annual toggle, and per-entity overage
 * for the multi-entity plans (Pro 3 incl., CFO Suite 10 incl., then $99/entity).
 * Surfaces the cheaper plan at the current entity count (Pro→CFO crossover at 8).
 * Owner-only actions; confirms a returned Checkout session.
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import { Check, Users, ArrowRight, Building2 } from 'lucide-react'

type Cycle = 'monthly' | 'annual'
interface PlanDef {
  id: 'STARTER' | 'GROWTH' | 'PRO' | 'CFO'
  label: string
  monthlyCents: number
  annualCents: number
  seats: number | null
  includedEntities: number
  entityOverageCents: number
  blurb: string
}
const usd = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`
const ORDER = ['STARTER', 'GROWTH', 'PRO', 'CFO']

export default function PlanSection() {
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [current, setCurrent] = useState<string>('STARTER')
  const [currentLabel, setCurrentLabel] = useState<string>('Starter')
  const [entityCount, setEntityCount] = useState(1)
  const [recommended, setRecommended] = useState<string>('PRO')
  const [status, setStatus] = useState<string>('none')
  const [isOwner, setIsOwner] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/billing')
    if (!res.ok) return
    const data = await res.json()
    setPlans(data.plans ?? [])
    setCurrent(data.currentPlan ?? 'STARTER')
    setCurrentLabel(data.currentPlanLabel ?? 'Starter')
    setEntityCount(data.entityCount ?? 1)
    setRecommended(data.recommendedPlan ?? 'PRO')
    setStatus(data.subscriptionStatus ?? 'none')
    setIsOwner(data.isOwner ?? false)
    setConfigured((data.billingConfigured && data.pricesConfigured) ?? false)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (params.get('billing') === 'plan' && sessionId) {
      fetch(`/api/billing/confirm?session_id=${encodeURIComponent(sessionId)}`)
        .catch(() => {})
        .finally(() => {
          window.history.replaceState(null, '', '/settings#billing')
          load()
        })
    } else {
      load()
    }
  }, [load])

  async function choose(plan: string) {
    setBusy(plan)
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, cycle }),
      })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
    } finally {
      setBusy(null)
    }
  }

  const currentIdx = ORDER.indexOf(current)
  // Nudge to a cheaper multi-entity plan when one exists and it isn't the current one.
  const showNudge = entityCount > 3 && recommended !== current && (current === 'PRO' || current === 'CFO')

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plan</h3>
        <div className="inline-flex rounded-lg border p-0.5 text-xs" style={{ borderColor: 'var(--color-surface-border)' }}>
          {(['monthly', 'annual'] as Cycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className="px-2.5 py-1 rounded-md font-medium capitalize"
              style={{ backgroundColor: cycle === c ? 'var(--color-info)' : 'transparent', color: cycle === c ? '#fff' : 'var(--color-text-secondary)' }}
            >
              {c}{c === 'annual' ? ' · 2 mo free' : ''}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs mb-1" style={{ color: status === 'past_due' || status === 'unpaid' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
        {status === 'past_due' || status === 'unpaid'
          ? 'Payment past due — update your card to keep your plan.'
          : `You're on the ${currentLabel} plan.`}
      </p>
      <p className="flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        <Building2 size={13} /> {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
      </p>

      {showNudge && (
        <div
          className="flex items-center justify-between rounded-lg border p-3 mb-4"
          style={{ borderColor: 'var(--color-info)', backgroundColor: 'rgba(59,130,246,0.06)' }}
        >
          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
            At {entityCount} entities, <strong>{recommended === 'CFO' ? 'CFO Suite' : 'Pro'}</strong> is cheaper.
          </span>
          <button
            onClick={() => choose(recommended)}
            disabled={!isOwner || !configured || busy !== null}
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-white whitespace-nowrap"
            style={{ backgroundColor: 'var(--color-info)', opacity: !isOwner || !configured || busy ? 0.6 : 1 }}
          >
            Switch &amp; save
          </button>
        </div>
      )}

      {!configured && (
        <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          Plan billing isn’t configured on the server yet.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {plans.map((p) => {
          const isCurrent = p.id === current
          const idx = ORDER.indexOf(p.id)
          const price = cycle === 'annual' ? p.annualCents : p.monthlyCents
          const multi = p.entityOverageCents > 0
          const over = cycle === 'annual' ? p.entityOverageCents * 10 : p.entityOverageCents
          return (
            <div
              key={p.id}
              className="rounded-lg border p-4"
              style={{ borderColor: isCurrent ? 'var(--color-info)' : 'var(--color-surface-border)', backgroundColor: isCurrent ? 'rgba(59,130,246,0.06)' : 'transparent' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.label}</span>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--color-info)' }}>
                    <Check size={12} /> Current
                  </span>
                )}
              </div>
              <p className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {usd(price)}<span className="text-xs font-normal" style={{ color: 'var(--color-text-secondary)' }}>/{cycle === 'annual' ? 'yr' : 'mo'}</span>
              </p>
              <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {multi
                  ? `Up to ${p.includedEntities} entities, then ${usd(over)}/entity`
                  : 'Single entity'}
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                {p.seats === null ? 'Unlimited seats' : `${p.seats} seat${p.seats === 1 ? '' : 's'}`} · {p.blurb}
              </p>
              {!isCurrent && (
                <button
                  onClick={() => choose(p.id)}
                  disabled={!isOwner || !configured || busy !== null}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--color-info)', opacity: !isOwner || !configured || busy ? 0.6 : 1 }}
                  title={!isOwner ? 'Only the owner can change the plan' : undefined}
                >
                  {busy === p.id ? 'Starting…' : idx > currentIdx ? 'Upgrade' : 'Switch'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Link
        href="/clients"
        className="flex items-center justify-between rounded-lg border p-3 mt-3"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <Users size={14} />
          A fractional CFO managing other businesses? See the white-label firm plans.
        </span>
        <ArrowRight size={14} style={{ color: 'var(--color-info)' }} />
      </Link>
    </Card>
  )
}
