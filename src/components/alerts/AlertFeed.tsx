'use client'

import { Bell, TrendingDown, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react'
import type { Alert } from '@/types'
import { timeAgo } from '@/lib/utils'
import Badge from '@/components/ui/Badge'

interface AlertFeedProps {
  alerts: Alert[]
  compact?: boolean
}

const typeConfig = {
  low_cash:     { icon: DollarSign,    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  anomaly:      { icon: AlertTriangle, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  milestone:    { icon: CheckCircle,   color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  churn_risk:   { icon: TrendingDown,  color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  revenue_drop: { icon: TrendingDown,  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
}

const severityBadge: Record<string, 'info' | 'warning' | 'danger'> = {
  info:    'info',
  warning: 'warning',
  critical: 'danger',
}

export default function AlertFeed({ alerts, compact = false }: AlertFeedProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface-card-hover)' }}>
          <Bell size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No alerts to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const cfg = typeConfig[alert.type] ?? typeConfig.anomaly
        const Icon = cfg.icon
        const isRead = !!alert.readAt

        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 p-4 rounded-lg transition-all"
            style={{
              backgroundColor: isRead ? 'var(--color-surface-card)' : 'var(--color-surface-card-hover)',
              border: `1px solid ${isRead ? 'var(--color-surface-border)' : 'rgba(59,130,246,0.2)'}`,
              opacity: isRead ? 0.7 : 1,
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: cfg.bg }}>
              <Icon size={14} style={{ color: cfg.color }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">{alert.title}</span>
                <Badge variant={severityBadge[alert.severity]} size="sm">{alert.severity}</Badge>
                {!isRead && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3B82F6' }} />}
              </div>
              {!compact && <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{alert.message}</p>}
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(alert.createdAt)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
