'use client'

import { useState, useEffect } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import useThemeColors from '@/hooks/useThemeColors'
import useChartConfig from '@/hooks/useChartConfig'
import ChartTooltip from './ChartTooltip'
import { CHART_MARGIN } from '@/lib/chart-config'

export interface IEPoint { month: string; income: number; expenses: number; net: number }

export default function IncomeExpenseChart({ data }: { data: IEPoint[] }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const colors = useThemeColors()
  const { grid, xAxis, yAxis, legend, light } = useChartConfig()
  if (!ready) return <div style={{ height: 280 }} />

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...xAxis} />
        <YAxis {...yAxis} />
        <Tooltip content={<ChartTooltip />} />
        <Legend {...legend} />
        <Bar dataKey="income" name="Income" fill={colors.success} fillOpacity={light ? 0.6 : 0.7} radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill={colors.danger} fillOpacity={light ? 0.6 : 0.7} radius={[3, 3, 0, 0]} />
        <Line type="monotone" dataKey="net" name="Net" stroke={colors.info} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
