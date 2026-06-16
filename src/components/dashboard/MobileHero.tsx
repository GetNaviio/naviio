'use client'

/**
 * Mobile-only glanceable header for a dashboard page (lg:hidden): one big hero
 * number with an optional trend + subtitle, then up to 3 compact chips. Mirrors
 * the Overview feed so every page reads the same on a phone — one number that
 * matters, then a few supporting figures. Desktop keeps its full grid.
 */
import { TrendingUp, TrendingDown } from 'lucide-react'

export interface HeroChip {
  label: string
  value: string
  color?: string
}

export default function MobileHero({
  label,
  value,
  sub,
  trend,
  chips = [],
}: {
  label: string
  value: string
  sub?: string | null
  /** Month-over-month % (optional). Shows a coloured arrow when provided. */
  trend?: number | null
  chips?: HeroChip[]
}) {
  return (
    <div className="lg:hidden space-y-4">
      <div className="rounded-2xl p-5" style={{ background: 'var(--hero-grad)', border: '1px solid var(--color-surface-border)' }}>
        <p className="text-xs" style={{ color: 'var(--hero-fg-muted)' }}>{label}</p>
        <div className="flex items-end gap-2 mt-1">
          <p className="text-[2.25rem] leading-none font-bold" style={{ color: 'var(--hero-fg)' }}>{value}</p>
          {trend != null && (
            <span className="text-xs mb-1 flex items-center gap-0.5" style={{ color: trend >= 0 ? '#9EFCE4' : '#FFC4C4' }}>
              {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(trend).toFixed(0)}%
            </span>
          )}
        </div>
        {sub && <p className="text-xs mt-2" style={{ color: 'var(--hero-fg-sub)' }}>{sub}</p>}
      </div>

      {chips.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {chips.map((c) => (
            <div key={c.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
              <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--color-text-muted)' }}>{c.label}</p>
              <p className="text-base font-semibold mt-1 truncate" style={{ color: c.color ?? 'var(--color-text-primary)' }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
