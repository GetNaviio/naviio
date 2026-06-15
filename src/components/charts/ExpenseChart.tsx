'use client'

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { ExpenseCategory } from '@/types'
import { formatCurrency } from '@/lib/utils'

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { category: string; amount: number; percentage: number } }> }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{d.category}</p>
      <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>{formatCurrency(d.amount)} ({d.percentage.toFixed(1)}%)</p>
    </div>
  )
}

export default function ExpenseChart({ data }: { data: ExpenseCategory[] }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return <div style={{ height: 260 }} />

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="amount">
          {data.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} stroke={entry.color} strokeWidth={0} />)}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}
