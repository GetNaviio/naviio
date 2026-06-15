export const CHART_GRID = {
  strokeDasharray: '3 3' as const,
  stroke: '#1E3055',
  vertical: false,
}

export const CHART_XAXIS = {
  tick: { fill: '#64748B', fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
}

export const CHART_YAXIS = {
  tick: { fill: '#64748B', fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
  width: 48,
  tickFormatter: (v: number) => `$${(v / 1000).toFixed(0)}K`,
}

export const CHART_YAXIS_COUNT = {
  tick: { fill: '#64748B', fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
  width: 40,
}

// Base legend config — charts add their own formatter (JSX) in .tsx files
export const CHART_LEGEND_BASE = {
  iconType: 'circle' as const,
  iconSize: 8,
}

export const CHART_MARGIN = { top: 5, right: 10, left: 0, bottom: 0 }
