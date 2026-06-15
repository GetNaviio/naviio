'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import IntegrationCard from '@/components/integrations/IntegrationCard'
import IntegrationCatalog from '@/components/integrations/IntegrationCatalog'
import PlaidLinkButton from '@/components/integrations/PlaidLink'
import { RefreshCw, CheckCircle2, AlertTriangle, PlusCircle } from 'lucide-react'
import type { Integration } from '@/types'

const INTEGRATIONS = [
  {
    provider: 'plaid' as const,
    name: 'Plaid',
    description: 'Connect your bank to see your real-time P&L, cash flow, and runway automatically. Bank-grade, read-only access via Plaid — your banking login is never shared with us.',
    logo: '🏦',
    category: 'Banking',
    connectHref: '#plaid',
  },
  {
    provider: 'stripe' as const,
    name: 'Stripe',
    description: 'MRR, ARR, charges, refunds, subscriptions, and churn metrics.',
    logo: '💳',
    category: 'Payments',
    connectHref: '/api/auth/stripe',
  },
  {
    provider: 'quickbooks' as const,
    name: 'QuickBooks Online',
    description: 'P&L, balance sheet, invoices, and expense data from QuickBooks.',
    logo: '📊',
    category: 'Accounting',
    connectHref: '/api/auth/quickbooks',
  },
  {
    provider: 'xero' as const,
    name: 'Xero',
    description: 'Financial statements, invoices, and bank feeds from Xero.',
    logo: '📋',
    category: 'Accounting',
    connectHref: '/api/auth/xero',
  },
  {
    provider: 'ghl' as const,
    name: 'GoHighLevel',
    description: 'CRM contacts, sales pipeline, and opportunity revenue from GHL.',
    logo: '🎯',
    category: 'CRM',
    connectHref: '/api/auth/ghl',
  },
  {
    provider: 'gusto' as const,
    name: 'Gusto',
    description: 'Payroll runs, headcount costs, and benefits data from Gusto.',
    logo: '👥',
    category: 'Payroll',
    connectHref: '/api/auth/gusto',
    phase: 'Early access',
  },
  {
    provider: 'adp' as const,
    name: 'ADP',
    description: 'Workforce data, payroll, and employee cost analysis from ADP.',
    logo: '🏢',
    category: 'Payroll',
    connectHref: '/api/auth/adp',
    phase: 'Early access',
  },
  {
    provider: 'meta-ads' as const,
    name: 'Meta Ads',
    description: 'Every Meta charge verified against its exact billing window — impressions, clicks, conversions, and ROAS on hover.',
    logo: '📣',
    category: 'Advertising',
    connectHref: '/api/auth/meta-ads',
    phase: 'Early access',
  },
  {
    provider: 'google-ads' as const,
    name: 'Google Ads',
    description: 'Every Google Ads charge reconciled against platform-reported spend — full campaign KPIs on hover.',
    logo: '🔍',
    category: 'Advertising',
    connectHref: '/api/auth/google-ads',
    phase: 'Early access',
  },
  {
    provider: 'shopify' as const,
    name: 'Shopify',
    description: 'Orders, revenue, refunds, and product margin data from your Shopify store.',
    logo: '🛍️',
    category: 'eCommerce',
    connectHref: '#shopify',
    phase: 'Early access',
  },
]

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
  // Providers whose connection broke and need an update-mode re-link.
  const [reconnect, setReconnect] = useState<Record<string, boolean>>({})
  // Providers with new accounts the bank exposed (add via account-selection update mode).
  const [newAccounts, setNewAccounts] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [shopDomain, setShopDomain] = useState('')
  const [showShopInput, setShowShopInput] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err'; provider?: string } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' = 'ok', provider?: string) {
    setToast({ msg, type, provider })
    setTimeout(() => setToast(null), 4000)
  }

  // Map a callback ?error= / ?success= code back to the integration card it belongs to.
  function providerFromCode(code: string): string | undefined {
    const c = code.toLowerCase()
    if (c.startsWith('qbo') || c.startsWith('quickbooks')) return 'quickbooks'
    if (c.startsWith('stripe')) return 'stripe'
    if (c.startsWith('xero')) return 'xero'
    if (c.startsWith('plaid')) return 'plaid'
    if (c.startsWith('shopify')) return 'shopify'
    if (c.startsWith('meta')) return 'meta-ads'
    if (c.startsWith('google')) return 'google-ads'
    return undefined
  }

  const fetchStatus = useCallback(async () => {
    try {
      // Fast, DB-only status — no live provider calls, so cards reflect the real
      // connection state immediately instead of flashing "Connect".
      const res = await fetch('/api/integrations/status')
      if (res.ok) {
        const data = await res.json()
        setSyncedAt(data.syncedAt)
        const next: Record<string, Integration> = {}
        for (const [provider, val] of Object.entries(data.sources ?? {})) {
          if (val) {
            next[provider] = { id: provider, provider: provider as Integration['provider'], status: 'active', connectedAt: '', lastSyncAt: data.syncedAt }
          }
        }
        setIntegrations(next)
        // Providers in ERROR state → surface a reconnect prompt.
        setReconnect((data.reconnect ?? {}) as Record<string, boolean>)
        // Providers with new accounts to add.
        setNewAccounts((data.newAccounts ?? {}) as Record<string, boolean>)
      }
    } catch { /* ignore in demo mode */ } finally {
      setStatusLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const error   = params.get('error')
    if (success || error) {
      window.history.replaceState({}, '', '/integrations')
      if (success) {
        // Flip the integration's button straight to "Connected" — no popup box.
        const p = providerFromCode(success) ?? success
        setIntegrations((prev) => ({
          ...prev,
          [p]: { id: p, provider: p as Integration['provider'], status: 'active', connectedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString() },
        }))
      }
      if (error) {
        // Pin the error onto its integration card (static "Try again" box) rather than a toast.
        const p = providerFromCode(error)
        const msg = error.endsWith('not_configured') ? 'Not configured' : 'Connection failed'
        if (p) setErrors((prev) => ({ ...prev, [p]: msg }))
        else showToast(`Connection failed: ${error}`, 'err')
      }
    }
    // Always load the real connection status from the DB on mount (fast, DB-only).
    fetchStatus()
  }, [fetchStatus])

  async function handleSync() {
    setSyncStatus('syncing')
    try {
      const res = await fetch('/api/integrations/sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSyncedAt(data.syncedAt)
      setSyncStatus('success')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 4000)
    }
  }

  // Clear a card's error → it returns to the normal blue "Connect" box.
  function handleRetry(provider: string) {
    setErrors((prev) => { const n = { ...prev }; delete n[provider]; return n })
  }

  function handleConnect(provider: string, connectHref: string) {
    if (provider === 'plaid') return  // handled by PlaidLinkButton below
    if (provider === 'shopify') { setShowShopInput(true); return }
    // stripe → OAuth "Connect with Stripe" (window.location to /api/auth/stripe)
    window.location.href = connectHref
  }

  // Update-mode (re-auth or add-accounts) completed → clear both prompts and
  // refresh status. No new card state change (the item was already connected).
  function handlePlaidUpdated() {
    showToast('Bank connection updated', 'ok', 'plaid')
    setReconnect((prev) => { const n = { ...prev }; delete n.plaid; return n })
    setNewAccounts((prev) => { const n = { ...prev }; delete n.plaid; return n })
    fetchStatus()
  }

  function handlePlaidSuccess() {
    showToast('Bank connected', 'ok', 'plaid')
    // Re-link succeeded → clear any reconnect prompt for Plaid.
    setReconnect((prev) => { const n = { ...prev }; delete n.plaid; return n })
    setIntegrations((prev) => ({
      ...prev,
      plaid: { id: 'plaid', provider: 'plaid', status: 'active', connectedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString() },
    }))
  }

  function handleShopifyConnect() {
    const raw = shopDomain.trim()
    if (!raw) return
    const shop = raw.includes('.myshopify.com') ? raw : `${raw}.myshopify.com`
    window.location.href = `/api/auth/shopify?shop=${encodeURIComponent(shop)}`
  }

  async function handleDisconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? Data sync will stop.`)) return
    setDisconnecting(provider)
    try {
      const res = await fetch(`/api/integrations/disconnect?provider=${provider}`, { method: 'DELETE' })
      if (res.ok) {
        setIntegrations((prev) => { const n = { ...prev }; delete n[provider]; return n })
        showToast('Disconnected', 'ok', provider)
      } else {
        showToast('Disconnect failed', 'err')
      }
    } catch {
      showToast('Disconnect failed', 'err')
    } finally {
      setDisconnecting(null)
    }
  }

  const launch = INTEGRATIONS.filter((i) => !i.phase)
  const phase2 = INTEGRATIONS.filter((i) => i.phase === 'Early access')
  const connected = Object.keys(integrations).length
  const total = launch.length

  return (
    <div>
      <Header title="Integrations" subtitle="Connect your financial tools — OAuth-secured, auto-syncing" />

      {/* Fallback toast (only for messages not tied to a specific integration card) */}
      {toast && !toast.provider && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl"
          style={{
            backgroundColor: toast.type === 'ok' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${toast.type === 'ok' ? '#10B981' : '#EF4444'}`,
            color: toast.type === 'ok' ? '#10B981' : '#EF4444',
          }}
        >
          {toast.msg}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Status bar */}
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: '#10B981' }} />
            <span className="text-sm text-white font-medium truncate">{connected} of {total} core integrations connected</span>
          </div>
          <div className="h-1.5 w-32 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-border)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${total > 0 ? (connected / total) * 100 : 0}%`, backgroundColor: '#10B981' }} />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {syncedAt && <span className="text-xs hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>Synced {new Date(syncedAt).toLocaleTimeString()}</span>}
            {syncStatus === 'success' && <CheckCircle2 size={14} style={{ color: '#10B981' }} />}
            {syncStatus === 'error'   && <AlertTriangle size={14} style={{ color: '#EF4444' }} />}
            <button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: 'var(--color-surface-border)', color: syncStatus === 'syncing' ? 'var(--color-text-muted)' : 'white' }}
              aria-label="Sync all integrations"
            >
              <RefreshCw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* Shopify domain input */}
        {showShopInput && (
          <div className="p-4 rounded-xl flex items-center gap-3" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid #2D4A7A' }}>
            <span className="text-lg">🛍️</span>
            <input
              type="text"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleShopifyConnect()}
              className="flex-1 bg-transparent text-sm outline-none text-white"
              style={{ '::placeholder': { color: 'var(--color-text-muted)' } } as unknown as React.CSSProperties}
              aria-label="Shopify store domain"
            />
            <button onClick={handleShopifyConnect} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: '#3B82F6', color: '#fff' }}>
              Connect
            </button>
            <button onClick={() => setShowShopInput(false)} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
          </div>
        )}

        {/* Reconnect prompt — Plaid item needs an update-mode re-link */}
        {reconnect['plaid'] && (
          <div
            className="p-4 rounded-xl flex items-center gap-3"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Your bank connection needs attention</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Your bank asked us to re-verify access (often after a password or login change). Reconnect to keep your financial data up to date.
              </p>
            </div>
            <PlaidLinkButton
              onSuccess={handlePlaidUpdated}
              updateMode
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
              style={{ backgroundColor: '#F59E0B', color: '#fff' }}
            >
              Reconnect bank
            </PlaidLinkButton>
          </div>
        )}

        {/* New-accounts prompt — bank exposed accounts the user can add */}
        {newAccounts['plaid'] && (
          <div
            className="p-4 rounded-xl flex items-center gap-3"
            style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)' }}
          >
            <PlusCircle size={18} style={{ color: '#3B82F6', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">New accounts available at your bank</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Your bank has accounts you haven&apos;t added yet. Add them to include their balances and transactions in your dashboard.
              </p>
            </div>
            <PlaidLinkButton
              onSuccess={handlePlaidUpdated}
              updateMode
              accountSelection
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
              style={{ backgroundColor: '#3B82F6', color: '#fff' }}
            >
              Add accounts
            </PlaidLinkButton>
          </div>
        )}

        {/* Core integrations */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>Core Integrations</h2>
          <div className="space-y-3">
            {launch.map((int) => {
              // Plaid uses its own Link modal flow — inject a custom connect button
              if (int.provider === 'plaid' && !integrations['plaid']) {
                return (
                  <IntegrationCard
                    key="plaid"
                    {...int}
                    integration={integrations['plaid']}
                    error={errors['plaid']}
                    onRetry={() => handleRetry('plaid')}
                    disconnecting={disconnecting === 'plaid'}
                    loading={!statusLoaded}
                    onConnect={() => {}}
                    onDisconnect={handleDisconnect}
                    customConnect={
                      <PlaidLinkButton
                        onSuccess={handlePlaidSuccess}
                        className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{ backgroundColor: '#3B82F6', color: '#fff' }}
                      >
                        Connect Bank
                      </PlaidLinkButton>
                    }
                  />
                )
              }
              return (
                <IntegrationCard
                  key={int.provider}
                  {...int}
                  integration={integrations[int.provider]}
                  error={errors[int.provider]}
                  onRetry={() => handleRetry(int.provider)}
                  disconnecting={disconnecting === int.provider}
                  loading={!statusLoaded}
                  onConnect={() => handleConnect(int.provider, int.connectHref)}
                  onDisconnect={handleDisconnect}
                />
              )
            })}
          </div>
        </div>

        {/* Early access — OAuth shipped, rolling out */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>Early Access — Payroll &amp; Commerce</h2>
          <div className="space-y-3">
            {phase2.map((int) => (
              <IntegrationCard
                key={int.provider}
                {...int}
                integration={integrations[int.provider]}
                loading={!statusLoaded}
                onConnect={() => handleConnect(int.provider, int.connectHref)}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        </div>

        {/* Full catalog — every industry, request-driven roadmap */}
        <IntegrationCatalog />

        {/* Endpoint reference */}
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
          <p className="text-xs font-semibold text-white mb-3">OAuth Endpoint Reference</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {[
              ['Plaid link token',   'POST /api/auth/plaid/create-link-token'],
              ['Plaid exchange',     'POST /api/auth/plaid/exchange-token'],
              ['QuickBooks',        'GET  /api/auth/quickbooks'],
              ['Xero',              'GET  /api/auth/xero'],
              ['Stripe Connect',    'GET  /api/auth/stripe'],
              ['Stripe API key',    'POST /api/auth/stripe  { apiKey }'],
              ['GoHighLevel',       'GET  /api/auth/ghl'],
              ['Gusto',             'GET  /api/auth/gusto'],
              ['ADP',               'GET  /api/auth/adp'],
              ['Shopify',           'GET  /api/auth/shopify?shop=store.myshopify.com'],
              ['Stripe Webhooks',   'POST /api/auth/stripe/webhook'],
              ['Sync all data',     'POST /api/integrations/sync'],
              ['Disconnect',        'DELETE /api/integrations/disconnect?provider=stripe'],
            ].map(([label, route]) => (
              <div key={label} className="flex gap-2 py-0.5">
                <span className="w-32 shrink-0">{label}</span>
                <code style={{ color: '#3B82F6', fontFamily: 'monospace' }}>{route}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
