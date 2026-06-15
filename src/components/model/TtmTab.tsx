'use client'

import { useCallback } from 'react'
import Card from '@/components/ui/Card'
import { SkeletonGrid, ErrorState } from '@/components/ui/PageState'
import { usePageData, fetchJson } from '@/hooks/usePageData'
import { formatCurrency } from '@/lib/utils'
import { buildTtmForecast, ttmActualTotals, type MonthlyActual } from '@/lib/model/ttm'
import { ymOfDate, type PlannedRole } from '@/lib/model/workforce'
import type { RoleRow } from './WorkforceTab'
import { ExportLink } from './SheetSync'
import FreshnessLine, { type MonthlyMeta } from './FreshnessLine'

export interface TtmAssumptionProps {
  startRevenue: number
  growthPct: number
  grossMarginPct: number
  startOpex: number
  opexGrowthPct: number
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

const th = 'px-3 py-2 text-xs font-semibold whitespace-nowrap text-right'
const td = 'px-3 py-2 text-sm whitespace-nowrap text-right'
const sticky = 'sticky left-0 z-10 text-left'

export default function TtmTab({ assumptions }: { assumptions: TtmAssumptionProps }) {
  const { data, loading, error, refetch } = usePageData(
    useCallback(async (signal: AbortSignal) => {
      const [monthly, workforce] = await Promise.all([
        fetchJson<{ months: MonthlyActual[]; meta?: MonthlyMeta }>('/api/model/monthly', signal),
        fetchJson<{ roles: RoleRow[] }>('/api/model/workforce', signal).catch(() => null),
      ])
      return { actuals: monthly.months, roles: (workforce?.roles ?? []) as PlannedRole[], meta: monthly.meta ?? null }
    }, []),
  )

  if (loading) return <SkeletonGrid />
  if (error) return <ErrorState message="We couldn't load the TTM forecast." onRetry={refetch} />

  const anchor = ymOfDate()
  const table = buildTtmForecast(
    anchor,
    {
      startRevenue: assumptions.startRevenue,
      growth: assumptions.growthPct / 100,
      grossMargin: assumptions.grossMarginPct / 100,
      startOpex: assumptions.startOpex,
      opexGrowth: assumptions.opexGrowthPct / 100,
    },
    data?.roles ?? [],
  )

  // TTM reference = trailing 12 COMPLETE months (everything before the anchor).
  const trailing = (data?.actuals ?? []).filter((m) => m.month < anchor).slice(-12)
  const ttm = ttmActualTotals(trailing)

  const rows: { label: string; ttm: number; values: number[]; total: number; bold?: boolean; muted?: boolean }[] = [
    { label: 'Revenue', ttm: ttm.revenue, values: table.columns.map((c) => c.revenue), total: table.total.revenue },
    { label: 'COGS', ttm: ttm.cogs, values: table.columns.map((c) => -c.cogs), total: -table.total.cogs, muted: true },
    { label: 'Gross Profit', ttm: ttm.grossProfit, values: table.columns.map((c) => c.grossProfit), total: table.total.grossProfit, bold: true },
    { label: 'OpEx', ttm: ttm.opex, values: table.columns.map((c) => -c.opex), total: -table.total.opex, muted: true },
    { label: '— of which workforce plan Δ', ttm: 0, values: table.columns.map((c) => -c.workforceDelta), total: -table.total.workforceDelta, muted: true },
    { label: 'Operating Income', ttm: ttm.operatingIncome, values: table.columns.map((c) => c.operatingIncome), total: table.total.operatingIncome, bold: true },
  ]

  const cell = (v: number, bold?: boolean) => (
    <span style={{ color: v < 0 ? 'var(--color-danger)' : undefined, fontWeight: bold ? 600 : undefined }}>
      {v < 0 ? `(${formatCurrency(Math.abs(v), true)})` : formatCurrency(v, true)}
    </span>
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card
        title="Rolling 12-month forecast"
        subtitle={`Months on columns · anchored ${monthLabel(anchor)} · seeded from the assumptions above`}
        tooltip="Revenue compounds at the monthly growth assumption; COGS follows gross margin; OpEx compounds at its growth rate plus the workforce plan delta (future hires/exits vs this month's plan). TTM column = trailing 12 months of actuals from your ledger for reference. Costs shown in parentheses."
        action={<ExportLink />}
      >
        <FreshnessLine meta={data?.meta} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={`${th} ${sticky}`} style={{ backgroundColor: 'var(--color-surface-card)' }}>Line</th>
                <th className={th} style={{ borderRight: '1px solid var(--color-surface-border)' }}>TTM (act.)</th>
                {table.months.map((m) => (
                  <th key={m} className={th}>{monthLabel(m)}</th>
                ))}
                <th className={th} style={{ borderLeft: '1px solid var(--color-surface-border)' }}>12-mo total</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--color-text-primary)' }}>
              {rows.map((r) => (
                <tr key={r.label} className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <td
                    className={`px-3 py-2 text-sm whitespace-nowrap ${sticky} ${r.bold ? 'font-semibold' : ''}`}
                    style={{ backgroundColor: 'var(--color-surface-card)', color: r.muted ? 'var(--color-text-secondary)' : undefined }}
                  >
                    {r.label}
                  </td>
                  <td className={td} style={{ borderRight: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    {r.label.startsWith('—') ? '—' : cell(r.label === 'COGS' || r.label === 'OpEx' ? -r.ttm : r.ttm)}
                  </td>
                  {r.values.map((v, i) => (
                    <td key={table.months[i]} className={td}>{cell(v, r.bold)}</td>
                  ))}
                  <td className={`${td} font-medium`} style={{ borderLeft: '1px solid var(--color-surface-border)' }}>
                    {cell(r.total, r.bold)}
                  </td>
                </tr>
              ))}
              {/* Margin rows — the first thing any reviewer scans for. */}
              {([
                {
                  label: 'Gross Margin %',
                  ttm: ttm.revenue > 0 ? ttm.grossProfit / ttm.revenue : null,
                  values: table.columns.map((c) => (c.revenue > 0 ? c.grossProfit / c.revenue : null)),
                  total: table.total.revenue > 0 ? table.total.grossProfit / table.total.revenue : null,
                },
                {
                  label: 'Operating Margin %',
                  ttm: ttm.revenue > 0 ? ttm.operatingIncome / ttm.revenue : null,
                  values: table.columns.map((c) => (c.revenue > 0 ? c.operatingIncome / c.revenue : null)),
                  total: table.total.revenue > 0 ? table.total.operatingIncome / table.total.revenue : null,
                },
              ] as { label: string; ttm: number | null; values: (number | null)[]; total: number | null }[]).map((r) => (
                <tr key={r.label} className="border-t" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  <td className={`px-3 py-2 text-xs whitespace-nowrap ${sticky}`} style={{ backgroundColor: 'var(--color-surface-card)' }}>
                    {r.label}
                  </td>
                  <td className={`${td} text-xs`} style={{ borderRight: '1px solid var(--color-surface-border)' }}>
                    {r.ttm == null ? '—' : `${(r.ttm * 100).toFixed(1)}%`}
                  </td>
                  {r.values.map((v, i) => (
                    <td key={table.months[i]} className={`${td} text-xs`} style={{ color: v != null && v < 0 ? 'var(--color-danger)' : undefined }}>
                      {v == null ? '—' : `${(v * 100).toFixed(1)}%`}
                    </td>
                  ))}
                  <td className={`${td} text-xs`} style={{ borderLeft: '1px solid var(--color-surface-border)' }}>
                    {r.total == null ? '—' : `${(r.total * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trailing.length < 12 && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            TTM reference column covers {trailing.length} month{trailing.length === 1 ? '' : 's'} of available actuals — it fills out as your ledger history grows.
          </p>
        )}
      </Card>
    </div>
  )
}
