'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import SocialAuth from '@/components/auth/SocialAuth'

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  // Post-signup destination round-trip (invite links). Same-origin paths only.
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }

      router.push(next || '/dashboard')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#060D1F' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <img src="/naviio-logo.png" alt="Naviio" className="h-24 w-auto" style={{ maxWidth: 420 }} />
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-medium" style={{ color: '#3B82F6' }}>Sign in</Link>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Full Name', name: 'name', type: 'text', placeholder: 'Eric Franco' },
            { label: 'Work Email', name: 'email', type: 'email', placeholder: 'eric@company.com' },
            { label: 'Company Name', name: 'company', type: 'text', placeholder: 'Acme Inc.' },
            { label: 'Password', name: 'password', type: 'password', placeholder: '8+ characters' },
          ].map(({ label, name, type, placeholder }) => (
            <div key={name}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
              <input
                type={type}
                name={name}
                value={(form as Record<string, string>)[name]}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none transition-all"
                style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)' }}
                placeholder={placeholder}
                minLength={name === 'password' ? 8 : undefined}
              />
            </div>
          ))}

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 mt-2"
            style={{ backgroundColor: loading ? 'var(--color-surface-border)' : '#3B82F6' }}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {loading ? 'Creating account...' : 'Create account'}
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
