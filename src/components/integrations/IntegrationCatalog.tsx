'use client'

/**
 * The integration catalog — every connector on the roadmap, searchable and
 * filterable by industry, with a per-org "Request" vote on each card.
 *
 * Votes land in IntegrationRequest via /api/integrations/request; the build
 * order of new connectors follows real demand. Requests are optimistic in the
 * UI and idempotent on the server, so double-clicks and races are harmless.
 */

import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles, Check, Hourglass, ChevronDown } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { usePersistentState } from '@/hooks/usePersistentState'
import { COMING_SOON, ALL_INDUSTRIES, type CatalogCategory, type CatalogEntry } from '@/lib/integrations/catalog'

const CATEGORY_ORDER: CatalogCategory[] = [
  'Payments',
  'Accounting',
  'Payroll & HR',
  'eCommerce & POS',
  'CRM & Sales',
  'Billing & Subscriptions',
  'Expenses & Spend',
  'Industry tools',
]

export default function IntegrationCatalog() {
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [industry, setIndustry] = useState<string | null>(null)
  // Collapsed by default — the heading + description stay as the invitation;
  // the full catalog expands on demand. Choice survives navigation.
  const [open, setOpen] = usePersistentState<boolean>('integrations:catalogOpen', false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/integrations/request', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.requested) setRequested(new Set(d.requested as string[])) })
      .catch(() => { /* catalog still browsable without vote state */ })
    return () => ctrl.abort()
  }, [])

  async function toggleRequest(slug: string) {
    const had = requested.has(slug)
    // Optimistic — server call is idempotent either direction.
    setRequested((prev) => {
      const n = new Set(prev)
      if (had) n.delete(slug); else n.add(slug)
      return n
    })
    try {
      const res = had
        ? await fetch(`/api/integrations/request?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
        : await fetch('/api/integrations/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
          })
      if (!res.ok) throw new Error()
    } catch {
      // Roll back on failure.
      setRequested((prev) => {
        const n = new Set(prev)
        if (had) n.add(slug); else n.delete(slug)
        return n
      })
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return COMING_SOON.filter((e) => {
      if (industry && !e.industries.includes(industry)) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.industries.some((i) => i.toLowerCase().includes(q))
      )
    })
  }, [query, industry])

  const byCategory = useMemo(() => {
    const m = new Map<CatalogCategory, CatalogEntry[]>()
    for (const cat of CATEGORY_ORDER) {
      const entries = filtered.filter((e) => e.category === cat)
      if (entries.length) m.set(cat, entries)
    }
    return m
  }, [filtered])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Integration Catalog — every industry
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {requested.size > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {requested.size} requested — we&apos;ll email you when they ship
          </span>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        Don&apos;t see your tool? Request it below — we build in order of demand. (Your bank is
        already covered: Plaid connects 12,000+ banks and credit unions.)
        {!open && (
          <>
            {' '}
            <button onClick={() => setOpen(true)} className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: '#3B82F6' }}>
              Browse {COMING_SOON.length} integrations
            </button>
          </>
        )}
      </p>

      {open && (
      <>

      {/* Search + industry dropdown */}
      <div className="flex items-center gap-2 mb-4 flex-wrap sm:flex-nowrap">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations — Square, payroll, restaurants…"
            className="flex-1 bg-transparent text-sm outline-none text-white"
            aria-label="Search the integration catalog"
          />
        </div>
        <div className="relative flex-shrink-0">
          <select
            value={industry ?? ''}
            onChange={(e) => setIndustry(e.target.value || null)}
            aria-label="Filter by industry"
            className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium outline-none cursor-pointer"
            style={{
              backgroundColor: industry ? 'rgba(59,130,246,0.12)' : 'var(--color-surface-card)',
              color: industry ? '#3B82F6' : 'var(--color-text-secondary)',
              border: `1px solid ${industry ? 'rgba(59,130,246,0.4)' : 'var(--color-surface-border)'}`,
            }}
          >
            <option value="">All industries</option>
            {ALL_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: industry ? '#3B82F6' : 'var(--color-text-muted)' }} />
        </div>
      </div>

      {/* Grouped results */}
      {byCategory.size === 0 ? (
        <div
          className="rounded-xl p-6 text-center"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          <Sparkles size={18} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-white font-medium">No integrations match &ldquo;{query}&rdquo;</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Tell us what you use — email{' '}
            <a href="mailto:hello@naviio.com?subject=Integration%20request" className="underline" style={{ color: '#3B82F6' }}>
              hello@naviio.com
            </a>{' '}
            and we&apos;ll add it to the roadmap.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...byCategory.entries()].map(([cat, entries]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>{cat}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entries.map((e) => {
                  const isRequested = requested.has(e.slug)
                  return (
                    <div
                      key={e.slug}
                      className="rounded-xl p-4 flex items-start gap-3 transition-all"
                      style={{
                        backgroundColor: 'var(--color-surface-card)',
                        border: `1px solid ${isRequested ? 'rgba(59,130,246,0.3)' : 'var(--color-surface-border)'}`,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: 'var(--color-surface-card-hover)' }}
                      >
                        {e.logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{e.name}</span>
                          <Badge variant="neutral" size="sm">Coming soon</Badge>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{e.description}</p>
                        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {e.industries.join(' · ')}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleRequest(e.slug)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                        style={isRequested
                          ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)' }
                          : { backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-surface-border)' }}
                        aria-pressed={isRequested}
                        title={isRequested ? 'Withdraw request' : `Request ${e.name}`}
                      >
                        {isRequested ? <Check size={12} /> : <Hourglass size={12} />}
                        {isRequested ? 'Requested' : 'Request'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
