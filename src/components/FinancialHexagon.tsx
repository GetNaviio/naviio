'use client'

import { useState, useEffect } from 'react'

export interface HexDimension {
  key:   string
  score: number   // 0–100
  value: string
}

interface Props {
  dimensions: HexDimension[]
}

// ─── Layout — tuned so labels never clip ─────────────────────────────────────
// ViewBox: 480 × 360  |  CX=240 CY=180
// R=117 (outer hex)   |  RL=157 (label centre)
// Margins: top ≥9px, bottom ≥8px, left ≥103px, right ≥97px from edge
const VW = 480, VH = 360
const CX = 240,  CY = 180
const R  = 117               // outer hexagon radius
const RL = 157               // label centre radius

function hexPt(r: number, i: number): [number, number] {
  const a = (Math.PI / 180) * (60 * i - 90)
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function scoreColor(s: number) {
  if (s >= 80) return '#10B981'
  if (s >= 60) return '#F59E0B'
  if (s >= 40) return '#F97316'
  return '#EF4444'
}

type Anchor = 'middle' | 'start' | 'end'

// Text alignment per vertex so labels hug the hex naturally
const ALIGN: { anchor: Anchor; dx: number; dy: number }[] = [
  { anchor: 'middle', dx:  0,  dy: -6 },  // 0 top
  { anchor: 'start',  dx:  8,  dy:  0 },  // 1 top-right
  { anchor: 'start',  dx:  8,  dy:  0 },  // 2 bottom-right
  { anchor: 'middle', dx:  0,  dy:  8 },  // 3 bottom
  { anchor: 'end',    dx: -8,  dy:  0 },  // 4 bottom-left
  { anchor: 'end',    dx: -8,  dy:  0 },  // 5 top-left
]

export default function FinancialHexagon({ dimensions }: Props) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return <div style={{ height: 280 }} />

  const scores   = dimensions.map(d => d.score / 100)
  const overall  = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)
  const dataPts  = scores.map((s, i) => hexPt(R * Math.max(0.05, s), i))
  const dataStr  = dataPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const _outerStr = [0,1,2,3,4,5].map(i => hexPt(R, i).join(',')).join(' ')

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
      aria-label="Financial Health Hexagon"
    >
      {/* Grid rings — dashed inners, solid outer */}
      {[0.25, 0.5, 0.75, 1].map(ring => (
        <polygon
          key={ring}
          points={[0,1,2,3,4,5].map(i => hexPt(R * ring, i).join(',')).join(' ')}
          fill="none"
          stroke={ring === 1 ? '#2D4A7A' : '#172033'}
          strokeWidth={ring === 1 ? 1.5 : 0.75}
          strokeDasharray={ring < 1 ? '3 3' : undefined}
        />
      ))}

      {/* Spokes */}
      {[0,1,2,3,4,5].map(i => {
        const [x, y] = hexPt(R, i)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#172033" strokeWidth={0.75} />
      })}

      {/* Data polygon */}
      <polygon
        points={dataStr}
        fill="rgba(59,130,246,0.14)"
        stroke="#3B82F6"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={5} fill={scoreColor(dimensions[i]?.score ?? 0)} stroke="#0D1B37" strokeWidth={1.5} />
      ))}

      {/* Labels — metric name + value at each vertex */}
      {dimensions.map(({ key, score, value }, i) => {
        const [lx, ly] = hexPt(RL, i)
        const { anchor, dx, dy } = ALIGN[i]
        const col = scoreColor(score)
        return (
          <g key={key}>
            <text x={lx + dx} y={ly + dy - 8}
              textAnchor={anchor} dominantBaseline="middle"
              fontSize={10} fontWeight={500} fill="#64748B"
            >{key}</text>
            <text x={lx + dx} y={ly + dy + 7}
              textAnchor={anchor} dominantBaseline="middle"
              fontSize={11} fontWeight={700} fill={col}
            >{value}</text>
          </g>
        )
      })}

      {/* Centre score badge */}
      <circle cx={CX} cy={CY} r={30} fill="#060D1F" stroke="var(--color-surface-border)" strokeWidth={1.5} />
      <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle" fontSize={20} fontWeight={700} fill="white">
        {overall}
      </text>
      <text x={CX} y={CY + 11} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={500} fill="#64748B">
        score
      </text>
    </svg>
  )
}
