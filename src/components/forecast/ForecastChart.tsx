'use client'

import { useState, useEffect } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import type { ForecastPoint } from '@/types'
import useChartConfig from '@/hooks/useChartConfig'

interface Props {
  data: ForecastPoint[]
  horizonMonths: number
}

const BEAR_COLOR = '#EF4444'
const BASE_COLOR = '#3B82F6'
const BULL_COLOR = '#10B981'

function CustomTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ value?: number; dataKey?: string; color?: string; stroke?: string; name?: string }> }) {
  if (!active || !payload?.length) return null
  const fmt = (v: number) => `$${(v / 1000).toFixed(1)}K`
  return (
    <div
      className="rounded-lg p-3 text-xs shadow-xl space-y-1"
      style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
    >
      <p className="font-semibold pb-1" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
      {payload.map((e) => {
        if (e.value == null) return null
        return (
          <div key={e.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color ?? e.stroke }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{e.name}:</span>
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{fmt(e.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ForecastChart({ data, horizonMonths: _horizonMonths }: Props) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const { grid, xAxis, light } = useChartConfig()
  if (!ready) return <div style={{ height: 340 }} />

  // The divider sits between the last historical month and the first forecast month
  const lastHistoricalMonth = data.filter((d) => d.isHistorical).at(-1)?.month

  const axisTick = { fill: light ? '#475569' : '#64748B', fontSize: 11 }
  const yAxis = {
    tick: axisTick,
    axisLine: false as const,
    tickLine: false as const,
    width: 52,
    tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}K`,
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          {/* Confidence band gradient */}
          <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BASE_COLOR} stopOpacity={light ? 0.08 : 0.12} />
            <stop offset="100%" stopColor={BASE_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...{ ...xAxis, interval: 2 }} />
        <YAxis {...yAxis} />
        <Tooltip content={<CustomTooltip />} />

        {/* Divider between historical and forecast */}
        {lastHistoricalMonth && (
          <ReferenceLine
            x={lastHistoricalMonth}
            stroke={light ? '#CBD5E1' : '#334155'}
            strokeDasharray="5 4"
            label={{
              value: 'Forecast →',
              position: 'insideTopRight',
              fill: light ? '#64748B' : '#475569',
              fontSize: 10,
              dx: 6,
            }}
          />
        )}

        {/* Confidence band: stacked area from bear to bull */}
        <Area
          dataKey="bear"
          stackId="band"
          fill="transparent"
          stroke="none"
          dot={false}
          activeDot={false}
          legendType="none"
          connectNulls
        />
        <Area
          dataKey="confidence"
          stackId="band"
          fill="url(#confGrad)"
          stroke="none"
          dot={false}
          activeDot={false}
          legendType="none"
          connectNulls
        />

        {/* Historical MRR — solid line */}
        <Line
          dataKey="historicalMrr"
          name="Historical MRR"
          stroke={BASE_COLOR}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, stroke: BASE_COLOR, strokeWidth: 2 }}
          connectNulls
        />

        {/* Bear scenario */}
        <Line
          dataKey="bear"
          name="Bear"
          stroke={BEAR_COLOR}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls
        />

        {/* Base scenario */}
        <Line
          dataKey="base"
          name="Base"
          stroke={BASE_COLOR}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />

        {/* Bull scenario */}
        <Line
          dataKey="bull"
          name="Bull"
          stroke={BULL_COLOR}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls
        />

        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{value}</span>
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
