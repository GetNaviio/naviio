import { formatCurrency } from '@/lib/utils'

interface Entry {
  name: string
  value: number
  color?: string
  stroke?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Entry[]
  label?: string
  formatter?: (value: number, name: string) => string
}

export default function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg p-3 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
    >
      <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }} aria-hidden>{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color ?? entry.stroke ?? 'var(--color-text-secondary)' }}
          />
          <span style={{ color: 'var(--color-text-secondary)' }}>{entry.name}:</span>
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {formatter ? formatter(entry.value, entry.name) : formatCurrency(entry.value, true)}
          </span>
        </div>
      ))}
    </div>
  )
}
