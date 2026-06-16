'use client'

/**
 * Command palette (the Header search). Opens with Cmd/Ctrl+K or the Search
 * button. Jumps to any page/section and live-searches transactions by
 * description/merchant via /api/transactions. Keyboard: ↑/↓ to move, Enter to
 * open, Esc to close (focus trap restores focus to the trigger).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft, FileText, LayoutDashboard, TrendingUp, Waves, BarChart3, Telescope, LineChart, CreditCard, Target, Calculator, Plug, Bell, Settings, Wallet, Shield } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { formatCurrency } from '@/lib/utils'

type NavItem = { label: string; href: string; hint?: string; keywords: string; icon: typeof Search }

const NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard', keywords: 'home dashboard summary', icon: LayoutDashboard },
  { label: 'P&L Statement', href: '/pl', keywords: 'profit loss income statement', icon: TrendingUp },
  { label: 'Cash Flow', href: '/cash-flow', keywords: 'burn runway cash', icon: Waves },
  { label: 'Revenue', href: '/revenue', keywords: 'mrr arr churn cohort', icon: BarChart3 },
  { label: 'Forecast', href: '/forecast', keywords: 'projection scenario', icon: Telescope },
  { label: 'Financial Model', href: '/model', keywords: 'model commentary export excel', icon: LineChart },
  { label: 'Expenses', href: '/expenses', keywords: 'transactions spend cogs categories', icon: CreditCard },
  { label: 'KPIs', href: '/kpis', keywords: 'cac ltv margin ebitda metrics', icon: Target },
  { label: 'CPA / Tax', href: '/cpa', keywords: 'tax accountant', icon: Calculator },
  { label: 'Integrations', href: '/integrations', keywords: 'plaid stripe quickbooks xero connect', icon: Plug },
  { label: 'Alerts', href: '/alerts', keywords: 'notifications anomaly', icon: Bell },
  { label: 'Settings', href: '/settings', keywords: 'account organization', icon: Settings },
  { label: 'Billing & Credits', href: '/settings#billing', keywords: 'credits balance reload pay invoice billing', icon: Wallet },
  { label: 'Security', href: '/settings#security', keywords: 'mfa passkey two factor password', icon: Shield },
]

interface Txn { id: string; description: string; merchantName: string | null; amount: number; type: 'debit' | 'credit'; date: string }

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [txns, setTxns] = useState<Txn[]>([])
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset query each time it opens; pull a recent batch of transactions once to
  // search client-side (fast, no new endpoint).
  useEffect(() => {
    if (!open) return
    setQuery(''); setSel(0)
    fetch('/api/transactions?limit=500')
      .then((r) => (r.ok ? r.json() : { transactions: [] }))
      .then((d) => setTxns(d.transactions ?? []))
      .catch(() => {})
  }, [open])

  const q = query.trim().toLowerCase()
  const navMatches = useMemo(
    () => (q ? NAV.filter((n) => n.label.toLowerCase().includes(q) || n.keywords.includes(q)) : NAV),
    [q],
  )
  const txnMatches = useMemo(() => {
    if (q.length < 2) return []
    return txns
      .filter((t) => `${t.description} ${t.merchantName ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6)
  }, [q, txns])

  // Flat result list so ↑/↓ moves across both groups.
  const results = useMemo(
    () => [
      ...navMatches.map((n) => ({ kind: 'nav' as const, item: n })),
      ...txnMatches.map((t) => ({ kind: 'txn' as const, item: t })),
    ],
    [navMatches, txnMatches],
  )

  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, results.length - 1))) }, [results.length])

  function activate(i: number) {
    const r = results[i]
    if (!r) return
    onClose()
    router.push(r.kind === 'nav' ? r.item.href : '/expenses')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); activate(sel) }
  }

  // Keep the selected row in view.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden outline-none"
        style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <Search size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSel(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search pages and transactions…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text-primary)' }}
            aria-label="Search pages and transactions"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded hidden sm:inline" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-surface-border)' }}>esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No matches for “{query}”.</p>
          ) : (
            <>
              {navMatches.length > 0 && <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Go to</p>}
              {navMatches.map((n, i) => {
                const idx = i
                const Icon = n.icon
                return (
                  <Row key={n.href} selected={sel === idx} onHover={() => setSel(idx)} onClick={() => activate(idx)}>
                    <Icon size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>{n.label}</span>
                  </Row>
                )
              })}

              {txnMatches.length > 0 && <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Transactions</p>}
              {txnMatches.map((t, i) => {
                const idx = navMatches.length + i
                return (
                  <Row key={t.id} selected={sel === idx} onHover={() => setSel(idx)} onClick={() => activate(idx)}>
                    <FileText size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{t.description || t.merchantName}</span>
                      <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </span>
                    <span className="text-sm font-semibold" style={{ color: t.type === 'credit' ? '#10B981' : 'var(--color-text-secondary)' }}>
                      {t.type === 'credit' ? '+' : '−'}{formatCurrency(t.amount, true)}
                    </span>
                  </Row>
                )
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t text-[11px]" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> open</span>
          <span>↑↓ navigate</span>
        </div>
      </div>
    </div>
  )
}

function Row({ selected, onHover, onClick, children }: { selected: boolean; onHover: () => void; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      data-selected={selected}
      onMouseEnter={onHover}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
      style={{ backgroundColor: selected ? 'rgba(59,130,246,0.12)' : 'transparent' }}
    >
      {children}
    </button>
  )
}
