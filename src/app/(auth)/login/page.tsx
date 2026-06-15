'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import SocialAuth from '@/components/auth/SocialAuth'

function LoginForm() {
  const params = useSearchParams()
  const errorCode = params.get('error')
  // Post-login destination round-trip (invite links). Same-origin paths only.
  const rawNext = params.get('next') ?? ''
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : ''
  const [showPw, setShowPw] = useState(false)

  const errorMsg =
    errorCode === 'invalid' ? 'Invalid email or password.' :
    errorCode === 'missing' ? 'Email and password are required.' :
    errorCode === 'server'  ? 'Server error — please try again.' :
    null

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#060D1F' }}>
      {/* Left — branding */}
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
              { label: 'Real-Time P&L',        icon: '📊' },
              { label: 'Cash Flow & Runway',    icon: '💰' },
              { label: 'Revenue Intelligence',  icon: '📈' },
              { label: 'Smart Alerts',          icon: '🔔' },
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

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/naviio-logo.png" alt="Naviio" className="h-20 w-auto" style={{ maxWidth: 340 }} />
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Sign in</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium" style={{ color: '#3B82F6' }}>
              Get started free
            </Link>
          </p>

          {errorMsg && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              {errorMsg}
            </div>
          )}

          {/* Native form POST — cookie set server-side via 302 redirect */}
          <form action="/api/auth/login" method="POST" className="space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none transition-all"
                style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' }}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none pr-10 transition-all"
                  style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all mt-2"
              style={{ backgroundColor: '#3B82F6' }}
            >
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
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
