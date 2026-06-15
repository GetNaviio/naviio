'use client'

/**
 * Projected revenue & operating-income line chart for the Financial Model page.
 * Split into its own module so the model page can lazy-load it via next/dynamic
 * — recharts stays out of the page's initial bundle.
 */
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/utils'

export interface ModelChartPoint {
  month: string
  Revenue: number
  'Operating Income': number
}

export default function ModelProjectionChart({ data }: { data: ModelChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => formatCurrency(v as number, true)} width={64} />
        <Tooltip formatter={(v) => formatCurrency(v as number, true)} contentStyle={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="Revenue" stroke="#3B82F6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Operating Income" stroke="#10B981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
