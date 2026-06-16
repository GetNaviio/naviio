'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import SocialAuth from '@/components/auth/SocialAuth'

// Mobile-first: 16px inputs (no iOS focus-zoom), big tap targets, a gradient CTA,
// and a focus ring. lg: overrides restore the original compact desktop styling.
const inputCls =
  'w-full text-white outline-none transition-all px-4 py-3.5 rounded-xl text-base ' +
  'lg:px-3 lg:py-2.5 lg:rounded-lg lg:text-sm ' +
  'focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/25'
const inputStyle = { backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' } as const

function LoginForm() {
  const params = useSearchParams()
  const errorCode = params.get('error')
  const rawNext = params.get('next') ?? ''
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : ''
  const [showPw, setShowPw] = useState(false)

  const errorMsg =
    errorCode === 'invalid' ? 'Invalid email or password.' :
    errorCode === 'missing' ? 'Email and password are required.' :
    errorCode === 'server'  ? 'Server error — please try again.' :
    errorCode === 'google_unconfigured' ? 'Google sign-in is unavailable right now.' :
    null

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#060D1F' }}>
      {/* Left — desktop branding (unchanged) */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12" style={{ backgroundColor: 'var(--color-surface-card)', borderRight: '1px solid var(--color-surface-border)' }}>
        <div>
          <img src="/naviio-logo.png" alt="Naviio" className="h-28 w-auto" style={{ maxWidth: 440 }} />
        </div>
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              CFO-level financial<br />intelligence, on demand.
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'var(--color-text-secondary)' }}>
              Connect Plaid, QuickBooks, Stripe and more — get a real-time P&L, cash flow, and KPI dashboard automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Real-Time P&L', icon: '📊' },
              { label: 'Cash Flow & Runway', icon: '💰' },
              { label: 'Revenue Intelligence', icon: '📈' },
              { label: 'Smart Alerts', icon: '🔔' },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
                <span className="text-xl">{icon}</span>
                <span className="text-sm font-medium text-white">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Meet your new Financial Co-Pilot</p>
      </div>

      {/* Right — form side (mobile-first) */}
      <div className="flex-1 flex flex-col px-6 lg:px-8">
        {/* Mobile brand hero — sits in the top third, not floating in a void */}
        <div className="lg:hidden flex flex-col items-center justify-center pt-[12vh] pb-8">
          <img src="/naviio-logo.png" alt="Naviio" className="w-auto" style={{ height: 96, maxWidth: 340 }} />
        </div>

        {/* Spacer pushes the form into the thumb zone on mobile only */}
        <div className="flex-1 lg:hidden" />

        {/* Form block — bottom-anchored on mobile, centered on desktop */}
        <div className="pb-10 lg:pb-0 lg:flex-1 lg:flex lg:items-center lg:justify-center">
          <div className="w-full max-w-sm mx-auto">
            <h2 className="text-3xl lg:text-2xl font-bold text-white mb-1">Sign in</h2>
            <p className="text-sm mb-7 lg:mb-8" style={{ color: 'var(--color-text-muted)' }}>
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium" style={{ color: '#4D8BFF' }}>Get started free</Link>
            </p>

            {errorMsg && (
              <div className="mb-4 px-3 py-2.5 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                {errorMsg}
              </div>
            )}

            <form action="/api/auth/login" method="POST" className="space-y-3.5">
              {next && <input type="hidden" name="next" value={next} />}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                <input type="email" name="email" required autoComplete="email" inputMode="email"
                  className={inputCls} style={inputStyle} placeholder="you@company.com" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} name="password" required autoComplete="current-password"
                    className={`${inputCls} pr-11`} style={inputStyle} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button type="submit"
                className="w-full rounded-xl lg:rounded-lg text-base lg:text-sm font-semibold text-white transition-all active:scale-[0.99] py-3.5 lg:py-2.5 mt-1"
                style={{ background: 'linear-gradient(135deg,#2F6BFF,#1E5BE6)' }}>
                Sign in
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
            </div>
            <SocialAuth mode="login" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
