'use client'

/**
 * First-run experience: connect → sync → first insight. Replaces the static
 * connect-prompt on the dashboard so a new user's first five minutes end with
 * THEIR numbers on screen, not skeletons. Disappears forever once data exists.
 *
 * Steps:
 *  1. connect — Plaid in-flow (the fastest path to real data), Stripe and the
 *     full catalog as alternates.
 *  2. syncing — polls /api/metrics until hasData; animated checklist so the
 *     wait feels like progress, with an honest slow-sync fallback.
 *  3. ready — the first-insight moment: their cash / income / expenses, then
 *     one click into the live dashboard.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Loader2, CheckCircle, Sparkles, ArrowRight } from 'lucide-react'
import PlaidLinkButton from '@/components/integrations/PlaidLink'
import { formatCurrency } from '@/lib/utils'

interface MetricsPayload {
  hasData: boolean
  sources?: { plaid?: boolean; stripe?: boolean; quickbooks?: boolean; xero?: boolean }
  incomeStatement?: { totalIncome: number; totalExpenses: number }
  cash?: { balance: number | null }
}

type Step = 'connect' | 'syncing' | 'ready'

const POLL_MS = 4000
const SLOW_AFTER_POLLS = 12 // ~48s → show the "taking a while" fallback

export default function OnboardingFlow({
  connected,
  onReady,
}: {
  /** At least one ledger source is connected (sync may still be running) */
  connected: boolean
  /** Called with the fresh metrics payload when the user opens the dashboard */
  onReady: (metrics: MetricsPayload) => void
}) {
  const [step, setStep] = useState<Step>(connected ? 'syncing' : 'connect')
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [polls, setPolls] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll for data while syncing; stop the moment it lands.
  useEffect(() => {
    if (step !== 'syncing') return
    const tick = async () => {
      try {
        const res = await fetch('/api/metrics')
        if (!res.ok) return
        const data: MetricsPayload = await res.json()
        if (data.hasData) {
          setMetrics(data)
          setStep('ready')
        } else {
          setPolls((p) => p + 1)
        }
      } catch { /* keep polling */ }
    }
    tick()
    timer.current = setInterval(tick, POLL_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [step])

  const slow = polls >= SLOW_AFTER_POLLS

  const stepIndex = step === 'connect' ? 0 : step === 'syncing' ? 1 : 2
  const STEPS = ['Connect', 'Sync', 'First insights']

  return (
    <div className="flex justify-center pt-6 sm:pt-12">
      <div
        className="w-full max-w-lg rounded-2xl p-6 sm:p-8 text-center"
        style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-7" aria-label={`Step ${stepIndex + 1} of 3`}>
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: i <= stepIndex ? '#3B82F6' : 'var(--color-text-muted)' }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={i < stepIndex
                    ? { backgroundColor: 'rgba(16,185,129,0.18)', color: '#10B981' }
                    : i === stepIndex
                      ? { backgroundColor: '#3B82F6', color: '#fff' }
                      : { backgroundColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="w-6 h-px" style={{ backgroundColor: 'var(--color-surface-border)' }} />}
            </div>
          ))}
        </div>

        {step === 'connect' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,184,166,0.18))' }}>
              <Building2 size={22} style={{ color: '#3B82F6' }} />
            </div>
            <h2 className="text-lg font-semibold text-white">Connect your bank to get started</h2>
            <p className="text-sm mt-2 mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Naviio builds your P&amp;L, cash flow, and runway from your real transactions — never demo data.
              Bank-grade, read-only access via Plaid; your banking login is never shared with us.
            </p>
            <PlaidLinkButton
              onSuccess={() => setStep('syncing')}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: '#3B82F6', color: '#fff', boxShadow: '0 0 24px rgba(59,130,246,0.3)' }}
            >
              Connect your bank
            </PlaidLinkButton>
            <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
              Run on Stripe?{' '}
              <a href="/api/auth/stripe" className="underline" style={{ color: '#3B82F6' }}>Connect Stripe</a>
              {' '}· or browse{' '}
              <Link href="/integrations" className="underline" style={{ color: '#3B82F6' }}>all integrations</Link>
            </p>
          </>
        )}

        {step === 'syncing' && (
          <>
            <h2 className="text-lg font-semibold text-white">Importing your financials…</h2>
            <p className="text-sm mt-2 mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              This usually takes under a minute. Navi is pulling your transactions and building your statements.
            </p>
            <ul className="text-left max-w-xs mx-auto space-y-3 mb-6">
              <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                <CheckCircle size={15} style={{ color: '#10B981', flexShrink: 0 }} /> Account connected
              </li>
              <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                <Loader2 size={15} className="animate-spin" style={{ color: '#3B82F6', flexShrink: 0 }} /> Importing transactions
              </li>
              <li className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <span className="w-[15px] h-[15px] rounded-full border flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }} /> Building your P&amp;L &amp; runway
              </li>
            </ul>
            {slow && (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Taking longer than usual — some banks deliver the first batch in a few minutes.
                You can wait here, or check the{' '}
                <Link href="/integrations" className="underline" style={{ color: '#3B82F6' }}>Integrations page</Link>
                {' '}and hit Sync Now.
              </p>
            )}
          </>
        )}

        {step === 'ready' && metrics && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(20,184,166,0.18))' }}>
              <Sparkles size={22} style={{ color: '#10B981' }} />
            </div>
            <h2 className="text-lg font-semibold text-white">Your numbers are ready</h2>
            <p className="text-sm mt-2 mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              Live from your bank — and every figure can be clicked to see the exact transactions behind it.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[
                { label: 'Cash', value: metrics.cash?.balance != null ? formatCurrency(metrics.cash.balance, true) : '—' },
                { label: 'Income YTD', value: formatCurrency(metrics.incomeStatement?.totalIncome ?? 0, true) },
                { label: 'Expenses YTD', value: formatCurrency(metrics.incomeStatement?.totalExpenses ?? 0, true) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg px-2 py-3" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                  <p className="text-base font-bold text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => onReady(metrics)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: '#10B981', color: '#fff', boxShadow: '0 0 24px rgba(16,185,129,0.3)' }}
            >
              Open my dashboard <ArrowRight size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
