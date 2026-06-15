'use client'

import type { ReactNode } from 'react'
import { CheckCircle, XCircle, AlertCircle, Loader2, Plus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { timeAgo } from '@/lib/utils'
import type { Integration } from '@/types'

interface IntegrationCardProps {
  provider: Integration['provider']
  name: string
  description: string
  logo: string
  category: string
  integration?: Integration
  onConnect: (provider: string) => void
  onDisconnect: (provider: string) => void
  phase?: string
  /** Inline mark after the badges (e.g. <NaviBadge />) */
  badge?: ReactNode
  customConnect?: ReactNode
  error?: string
  onRetry?: (provider: string) => void
  disconnecting?: boolean
  loading?: boolean
}

const statusConfig = {
  active: { icon: CheckCircle, color: '#10B981', label: 'Connected', badge: 'success' as const },
  error: { icon: XCircle, color: '#EF4444', label: 'Error', badge: 'danger' as const },
  disconnected: { icon: AlertCircle, color: '#F59E0B', label: 'Disconnected', badge: 'warning' as const },
  pending: { icon: Loader2, color: '#3B82F6', label: 'Connecting...', badge: 'info' as const },
}

export default function IntegrationCard({
  provider,
  name,
  description,
  logo,
  category,
  integration,
  onConnect,
  onDisconnect,
  phase,
  badge,
  customConnect,
  error,
  onRetry,
  disconnecting = false,
  loading = false,
}: IntegrationCardProps) {
  const connected = integration?.status === 'active'
  const status = integration?.status
  const sc = status ? statusConfig[status] : null
  const _StatusIcon = sc?.icon

  return (
    <div
      className="rounded-xl p-5 flex items-start gap-4 transition-all"
      style={{ backgroundColor: 'var(--color-surface-card)', border: `1px solid ${connected ? 'rgba(59,130,246,0.3)' : 'var(--color-surface-border)'}` }}
    >
      {/* Logo */}
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
        {logo}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">{name}</span>
          <Badge variant="neutral" size="sm">{category}</Badge>
          {phase && <Badge variant="info" size="sm">{phase}</Badge>}
          {badge}
          {sc && <Badge variant={sc.badge} size="sm">{sc.label}</Badge>}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        {integration?.lastSyncAt && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Last sync: {timeAgo(integration.lastSyncAt)}
          </p>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {loading && !connected ? (
          <span
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium opacity-50"
            style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-muted)' }}
          >
            <Loader2 size={12} className="animate-spin" />
            Loading
          </span>
        ) : error && !connected ? (
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#EF4444' }}>
              <XCircle size={13} />
              {error}
            </span>
            <button
              onClick={() => onRetry?.(provider)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }}
            >
              Try again
            </button>
          </div>
        ) : customConnect && !connected ? customConnect : connected ? (
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)' }}
            >
              <CheckCircle size={13} />
              Connected
            </span>
            <button
              onClick={() => onDisconnect(provider)}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:underline disabled:no-underline disabled:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {disconnecting && <Loader2 size={12} className="animate-spin" />}
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onConnect(provider)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ backgroundColor: '#3B82F6', color: '#fff' }}
          >
            <Plus size={12} />
            Connect
          </button>
        )}
      </div>
    </div>
  )
}
