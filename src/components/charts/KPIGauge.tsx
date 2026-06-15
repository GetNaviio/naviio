'use client'

interface KPIGaugeProps {
  value: number
  target: number
  color?: string
}

export default function KPIGauge({ value, target, color = '#3B82F6' }: KPIGaugeProps) {
  const pct = Math.min((value / target) * 100, 100)
  const r = 28
  const circumference = 2 * Math.PI * r
  const strokeDash = (pct / 100) * circumference
  // Read CSS variable fallback when available
  let strokeColor = color
  try {
    if (typeof window !== 'undefined') {
      const el = document.getElementById('app-root') || document.documentElement
      const cs = getComputedStyle(el as Element).getPropertyValue('--color-info')
      if (cs) strokeColor = cs
    }
  } catch {}

  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={r} fill="none" stroke="var(--color-surface-border)" strokeWidth={6} />
      <circle
        cx={36}
        cy={36}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={6}
        strokeDasharray={`${strokeDash} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x={36} y={36} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="var(--color-text-primary)">
        {pct.toFixed(0)}%
      </text>
    </svg>
  )
}
