import { TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react'
import { formatPercent } from '@/lib/utils'
import type { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  prefix?: string
  suffix?: string
  trend?: number
  trendLabel?: string
  /** Which direction is favorable (colors green). Default 'up' — pass 'down' for cost metrics. */
  goodWhen?: 'up' | 'down'
  icon?: ReactNode
  iconBg?: string
  subtitle?: string
  tooltip?: string
  /** Optional mini trend line (one value per period, oldest → newest). */
  sparkline?: number[]
  sparklineColor?: string
}

/** Lightweight inline SVG sparkline — no chart library, scales to the card width. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null
  const w = 100, h = 32
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 36 }} aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity={0.08} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function MetricCard({
  title,
  value,
  prefix,
  suffix,
  trend,
  trendLabel = 'vs last month',
  goodWhen = 'up',
  icon,
  iconBg,
  subtitle,
  tooltip,
  sparkline,
  sparklineColor,
}: MetricCardProps) {
  const trendPositive = trend !== undefined && trend > 0
  const trendNegative = trend !== undefined && trend < 0
  const trendNeutral  = trend !== undefined && trend === 0
  // Arrow follows the sign of the change; COLOR follows favorability.
  const trendGood = trend !== undefined && trend !== 0 && (goodWhen === 'up' ? trend > 0 : trend < 0)

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:translate-y-[-1px]"
      style={{
        backgroundColor: 'var(--color-surface-card)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{title}</p>
          {tooltip && (
            <div className="group relative flex-shrink-0">
              <HelpCircle size={13} className="cursor-help" style={{ color: 'var(--color-text-muted)' }} />
              <div
                className="pointer-events-none absolute top-full left-0 z-50 w-56 mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                style={{
                  backgroundColor: 'var(--color-surface-input)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-secondary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                }}
              >
                <span
                  className="absolute bottom-full left-2 block w-0 h-0"
                  style={{
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderBottom: '5px solid var(--color-surface-border)',
                  }}
                />
                {tooltip}
              </div>
            </div>
          )}
        </div>

        {icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ml-2"
            style={{ backgroundColor: iconBg ?? 'var(--color-surface-card-hover)' }}
          >
            {icon}
          </div>
        )}
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          {prefix && <span style={{ color: 'var(--color-text-muted)' }}>{prefix}</span>}
          {value}
          {suffix && <span className="text-base font-medium ml-1" style={{ color: 'var(--color-text-muted)' }}>{suffix}</span>}
        </p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>

      {trend !== undefined && (
        <div className="flex items-center gap-1.5">
          {trendPositive && <TrendingUp size={13} style={{ color: trendGood ? 'var(--color-success)' : 'var(--color-danger)' }} />}
          {trendNegative && <TrendingDown size={13} style={{ color: trendGood ? 'var(--color-success)' : 'var(--color-danger)' }} />}
          {trendNeutral  && <Minus size={13} style={{ color: 'var(--color-text-muted)' }} />}
          <span
            className="text-xs font-semibold"
            style={{ color: trendNeutral ? 'var(--color-text-muted)' : trendGood ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {formatPercent(trend)}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{trendLabel}</span>
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-auto -mb-1">
          <Sparkline data={sparkline} color={sparklineColor ?? 'var(--color-info)'} />
        </div>
      )}
    </div>
  )
}
