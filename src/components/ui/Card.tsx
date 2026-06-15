import type { ReactNode } from 'react'
import InfoTip from './InfoTip'

interface CardProps {
  children: ReactNode
  title?: string
  subtitle?: string
  tooltip?: string
  action?: ReactNode
  /** Inline mark rendered right after the title (e.g. <NaviBadge />). */
  badge?: ReactNode
  className?: string
  padding?: boolean
}

export default function Card({ children, title, subtitle, tooltip, action, badge, className = '', padding = true }: CardProps) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        backgroundColor: 'var(--color-surface-card)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      {(title || action) && (
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div>
            {title && (
              <h3 className="flex items-center gap-1.5 flex-wrap text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {title}
                {badge}
                {tooltip && <InfoTip text={tooltip} />}
              </h3>
            )}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
