'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { PLDataPoint } from '@/types'
import ChartTooltip from './ChartTooltip'
import useChartConfig from '@/hooks/useChartConfig'
import useThemeColors from '@/hooks/useThemeColors'

interface PLChartProps { data: PLDataPoint[]; showAll?: boolean }

export default function PLChart({ data, showAll: _showAll = false }: PLChartProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const { grid, xAxis, yAxis, gradOpacity, legend, margin } = useChartConfig()
  const colors = useThemeColors()
  if (!ready) return <div style={{ height: 280 }} />

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={margin}>
        <defs>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.info} stopOpacity={gradOpacity} />
            <stop offset="95%" stopColor={colors.info} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradGrossProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.success} stopOpacity={gradOpacity} />
            <stop offset="95%" stopColor={colors.success} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...xAxis} />
        <YAxis {...yAxis} />
        <Tooltip content={<ChartTooltip />} />
        <Legend {...legend} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.info} strokeWidth={2} fill="url(#gradRevenue)" dot={false} />
        <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke={colors.success} strokeWidth={2} fill="url(#gradGrossProfit)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
