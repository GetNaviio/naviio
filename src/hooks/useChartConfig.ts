'use client'

import { useTheme } from '@/components/layout/ThemeContext'
import { CHART_LEGEND_BASE, CHART_MARGIN } from '@/lib/chart-config'

export function useChartConfig() {
  const { theme } = useTheme()
  const light = theme === 'light'

  const grid = {
    strokeDasharray: '3 3' as const,
    stroke: light ? '#E2E8F0' : '#1E3055',
    vertical: false,
  }

  const tick = { fill: light ? '#475569' : '#64748B', fontSize: 11 }

  const xAxis = {
    tick,
    axisLine: false as const,
    tickLine: false as const,
  }

  const yAxis = {
    tick,
    axisLine: false as const,
    tickLine: false as const,
    width: 48,
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}K`,
  }

  const yAxisCount = {
    tick,
    axisLine: false as const,
    tickLine: false as const,
    width: 40,
  }

  // Gradient fill opacity — more visible on white backgrounds
  const gradOpacity = light ? 0.22 : 0.15

  return { grid, xAxis, yAxis, yAxisCount, gradOpacity, light, legend: CHART_LEGEND_BASE, margin: CHART_MARGIN }
}

export default useChartConfig
