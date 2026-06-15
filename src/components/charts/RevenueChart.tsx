'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Area,
} from 'recharts'
import useThemeColors from '@/hooks/useThemeColors'
import useChartConfig from '@/hooks/useChartConfig'
import type { RevenueDataPoint } from '@/types'
import ChartTooltip from './ChartTooltip'
import { CHART_MARGIN } from '@/lib/chart-config'

interface RevenueChartProps { data: RevenueDataPoint[]; variant?: 'mrr' | 'breakdown' | 'customers' }

export default function RevenueChart({ data, variant = 'mrr' }: RevenueChartProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const colors = useThemeColors()
  const { grid, xAxis, yAxis, yAxisCount, gradOpacity, legend, light } = useChartConfig()
  if (!ready) return <div style={{ height: 280 }} />

  if (variant === 'breakdown') return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...xAxis} />
        <YAxis {...yAxis} />
        <Tooltip content={<ChartTooltip />} />
        <Legend {...legend} />
        <Bar dataKey="newMrr" name="New MRR" fill={colors.info} fillOpacity={light ? 0.75 : 0.85} stackId="a" />
        <Bar dataKey="expansionMrr" name="Expansion MRR" fill={colors.success} fillOpacity={light ? 0.75 : 0.85} stackId="a" />
        <Bar dataKey="churnedMrr" name="Churned MRR" fill={colors.danger} fillOpacity={light ? 0.75 : 0.85} stackId="b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )

  if (variant === 'customers') return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="gradCustomers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.purple} stopOpacity={gradOpacity} />
            <stop offset="95%" stopColor={colors.purple} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...xAxis} />
        <YAxis {...yAxisCount} />
        <Tooltip content={<ChartTooltip formatter={(v) => v.toLocaleString()} />} />
        <Area type="monotone" dataKey="customers" name="Customers" stroke={colors.purple} strokeWidth={2} fill="url(#gradCustomers)" dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="gradMRR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.info} stopOpacity={gradOpacity} />
            <stop offset="95%" stopColor={colors.info} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...xAxis} />
        <YAxis {...yAxis} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="mrr" name="MRR" stroke={colors.info} strokeWidth={2.5} fill="url(#gradMRR)" dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
