'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import SocialAuth from '@/components/auth/SocialAuth'

const inputCls =
  'w-full text-white outline-none transition-all px-4 py-3.5 rounded-xl text-base ' +
  'lg:px-3 lg:py-2.5 lg:rounded-lg lg:text-sm ' +
  'focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/25'
const inputStyle = { backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' } as const

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const rawNext = params.get('next') ?? ''
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : ''
  const [form, setForm] = useState({ name: '', email: '', company: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed'); return }
      router.push(next || '/dashboard')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { label: 'Full Name', name: 'name', type: 'text', placeholder: 'Eric Franco', autoComplete: 'name' },
    { label: 'Work Email', name: 'email', type: 'email', placeholder: 'eric@company.com', autoComplete: 'email' },
    { label: 'Company Name', name: 'company', type: 'text', placeholder: 'Acme Inc.', autoComplete: 'organization' },
    { label: 'Password', name: 'password', type: 'password', placeholder: '8+ characters', autoComplete: 'new-password' },
  ]

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 lg:items-center" style={{ backgroundColor: '#060D1F' }}>
      <div className="w-full max-w-sm mx-auto">
        {/* Brand hero */}
        <div className="flex justify-center lg:justify-start mb-8">
          <img src="/naviio-logo.png" alt="Naviio" className="w-auto" style={{ height: 52, maxWidth: 240 }} />
        </div>

        <h2 className="text-3xl lg:text-2xl font-bold text-white mb-1">Create your account</h2>
        <p className="text-sm mb-7 lg:mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-medium" style={{ color: '#4D8BFF' }}>Sign in</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {fields.map(({ label, name, type, placeholder, autoComplete }) => (
            <div key={name}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
              <input
                type={type} name={name} autoComplete={autoComplete}
                value={(form as Record<string, string>)[name]} onChange={handleChange} required
                className={inputCls} style={inputStyle} placeholder={placeholder}
                minLength={name === 'password' ? 8 : undefined}
              />
            </div>
          ))}

          {error && (
            <p className="text-sm px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#F87171' }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-xl lg:rounded-lg text-base lg:text-sm font-semibold text-white transition-all active:scale-[0.99] flex items-center justify-center gap-2 py-3.5 lg:py-2.5 mt-1"
            style={{ background: loading ? 'var(--color-surface-border)' : 'linear-gradient(135deg,#2F6BFF,#1E5BE6)' }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--color-text-muted)' }}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />
        </div>
        <SocialAuth mode="register" />
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}
