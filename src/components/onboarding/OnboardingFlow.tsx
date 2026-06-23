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
import { Building2, Loader2, CheckCircle, Sparkles, ArrowRight, Briefcase, Users } from 'lucide-react'
import PlaidLinkButton from '@/components/integrations/PlaidLink'
import { formatCurrency } from '@/lib/utils'
import { INDUSTRIES, type Industry } from '@/lib/metrics/industry'

type AccountType = 'owner' | 'advisor'

interface MetricsPayload {
  hasData: boolean
  sources?: { plaid?: boolean; stripe?: boolean; quickbooks?: boolean; xero?: boolean }
  incomeStatement?: { totalIncome: number; totalExpenses: number }
  cash?: { balance: number | null }
  industry?: Industry | null
  accountType?: AccountType | null
}

type Step = 'account' | 'business' | 'connect' | 'syncing' | 'ready' | 'firm'

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
  const [step, setStep] = useState<Step>(connected ? 'syncing' : 'account')
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [polls, setPolls] = useState(0)
  const [savingInd, setSavingInd] = useState<Industry | null>(null)
  const [savingAcct, setSavingAcct] = useState<AccountType | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Resume the right step on mount from what's already saved: an advisor goes
  // straight to firm setup; an owner skips the business step if industry is set;
  // a brand-new user starts at the account-type choice.
  useEffect(() => {
    if (connected) return
    let alive = true
    fetch('/api/metrics').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive || !d) return
      if (d.accountType === 'advisor') { setStep((s) => (s === 'account' ? 'firm' : s)); return }
      if (d.accountType === 'owner') { setStep((s) => (s === 'account' ? (d.industry ? 'connect' : 'business') : s)) }
      // null accountType → stay on the 'account' step and ask
    }).catch(() => {})
    return () => { alive = false }
  }, [connected])

  async function pickAccount(type: AccountType) {
    setSavingAcct(type)
    try {
      await fetch('/api/user/account-type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountType: type }) })
    } catch { /* non-blocking */ }
    setSavingAcct(null)
    setStep(type === 'advisor' ? 'firm' : 'business')
  }

  async function pickIndustry(id: Industry) {
    setSavingInd(id)
    try {
      await fetch('/api/org/industry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ industry: id }) })
    } catch { /* non-blocking — they can set it later in Settings */ }
    setSavingInd(null)
    setStep('connect')
  }

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

  // The numbered indicator covers the owner path only (Business→…→First insights);
  // the account-type choice and the advisor firm-setup branch don't show it.
  const ownerPath = step === 'business' || step === 'connect' || step === 'syncing' || step === 'ready'
  const stepIndex = step === 'business' ? 0 : step === 'connect' ? 1 : step === 'syncing' ? 2 : 3
  const STEPS = ['Business', 'Connect', 'Sync', 'First insights']

  return (
    <div className="flex justify-center pt-6 sm:pt-12">
      <div
        className="w-full max-w-lg rounded-2xl p-6 sm:p-8 text-center"
        style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
      >
        {/* Step indicator (owner path only) */}
        {ownerPath && (
        <div className="flex items-center justify-center gap-2 mb-7" aria-label={`Step ${stepIndex + 1} of 4`}>
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
        )}

        {step === 'account' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,184,166,0.18))' }}>
              <Sparkles size={22} style={{ color: '#3B82F6' }} />
            </div>
            <h2 className="text-lg font-semibold text-white">Welcome to Naviio</h2>
            <p className="text-sm mt-2 mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              How will you use Naviio? This sets up the right experience for you.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => pickAccount('owner')}
                disabled={savingAcct != null}
                className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl transition-colors"
                style={{ border: '1px solid var(--color-surface-border)', backgroundColor: savingAcct === 'owner' ? 'rgba(59,130,246,0.1)' : 'transparent', opacity: savingAcct === 'advisor' ? 0.5 : 1 }}
              >
                <Building2 size={24} style={{ color: '#3B82F6' }} />
                <span className="text-sm font-semibold text-white">I run a business</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Track my own company&rsquo;s finances</span>
              </button>
              <button
                onClick={() => pickAccount('advisor')}
                disabled={savingAcct != null}
                className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl transition-colors"
                style={{ border: '1px solid var(--color-surface-border)', backgroundColor: savingAcct === 'advisor' ? 'rgba(20,184,166,0.1)' : 'transparent', opacity: savingAcct === 'owner' ? 0.5 : 1 }}
              >
                <Users size={24} style={{ color: '#14B8A6' }} />
                <span className="text-sm font-semibold text-white">I&rsquo;m a fractional CFO</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Advise and manage multiple clients</span>
              </button>
            </div>
          </>
        )}

        {step === 'firm' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(16,185,129,0.18))' }}>
              <Users size={22} style={{ color: '#14B8A6' }} />
            </div>
            <h2 className="text-lg font-semibold text-white">Set up your practice</h2>
            <p className="text-sm mt-2 mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Add your clients and Naviio gives each one its own connected dashboard, P&amp;L, and Navi Score — switch between them from the top bar. Invite a client and they connect their own bank; you get read-only access.
            </p>
            <Link
              href="/clients"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: '#14B8A6', color: '#fff', boxShadow: '0 0 24px rgba(20,184,166,0.3)' }}
            >
              Add your first client <ArrowRight size={15} />
            </Link>
            <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
              Also want to track your own firm&rsquo;s books?{' '}
              <button onClick={() => setStep('business')} className="underline" style={{ color: '#14B8A6' }}>Set that up</button>
            </p>
          </>
        )}

        {step === 'business' && (
          <>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(20,184,166,0.18))' }}>
              <Briefcase size={22} style={{ color: '#3B82F6' }} />
            </div>
            <h2 className="text-lg font-semibold text-white">What kind of business is this?</h2>
            <p className="text-sm mt-2 mb-5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Navi tailors your metrics and health score to your industry — a restaurant sees prime cost, a SaaS company sees MRR &amp; churn. You can change this anytime in Settings.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {INDUSTRIES.filter((i) => i.id !== 'generic').map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => pickIndustry(opt.id)}
                  disabled={savingInd != null}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    border: '1px solid var(--color-surface-border)',
                    backgroundColor: savingInd === opt.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: 'var(--color-text-primary)',
                    opacity: savingInd != null && savingInd !== opt.id ? 0.5 : 1,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setStep('connect')} className="text-xs mt-4 underline" style={{ color: 'var(--color-text-muted)' }}>
              Skip for now
            </button>
          </>
        )}

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
