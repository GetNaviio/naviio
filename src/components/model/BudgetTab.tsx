'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { SkeletonGrid, ErrorState } from '@/components/ui/PageState'
import { usePageData, fetchJson } from '@/hooks/usePageData'
import { formatCurrency } from '@/lib/utils'
import { ymOfDate } from '@/lib/model/workforce'
import { Save } from 'lucide-react'
import { ExportLink, ImportButton } from './SheetSync'
import FreshnessLine, { type MonthlyMeta } from './FreshnessLine'

type Line = 'REVENUE' | 'COGS' | 'OPEX'
const LINES: { key: Line; label: string }[] = [
  { key: 'REVENUE', label: 'Revenue' },
  { key: 'COGS', label: 'COGS' },
  { key: 'OPEX', label: 'OpEx' },
]

interface BudgetLineRow { month: string; line: Line; amount: number }
interface MonthlyActual { month: string; revenue: number; cogs: number; opex: number; operatingIncome: number }

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const th = 'px-3 py-2 text-xs font-semibold whitespace-nowrap'
const td = 'px-3 py-2 text-sm whitespace-nowrap'

/** key 'YYYY-MM|LINE' → amount */
type Grid = Record<string, number>
const gk = (month: string, line: Line) => `${month}|${line}`

export default function BudgetTab() {
  const currentYear = new Date().getUTCFullYear()
  const [year, setYear] = useState(String(currentYear))
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(String)
  const months = MONTH_SHORT.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  const { data, loading, error, refetch } = usePageData(
    useCallback(
      async (signal: AbortSignal) => {
        const [budget, actuals] = await Promise.all([
          fetchJson<{ lines: BudgetLineRow[] }>(`/api/model/budget?year=${year}`, signal),
          fetchJson<{ months: MonthlyActual[]; meta?: MonthlyMeta }>('/api/model/monthly', signal).catch(() => null),
        ])
        return { budget: budget.lines, actuals: actuals?.months ?? [], meta: actuals?.meta ?? null }
      },
      [year],
    ),
  )

  const [grid, setGrid] = useState<Grid>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<{ text: string; error: boolean } | null>(null)

  // Seed the editable grid from persisted budget once loaded.
  useEffect(() => {
    if (!data) return
    const g: Grid = {}
    for (const l of data.budget) g[gk(l.month, l.line as Line)] = l.amount
    setGrid(g)
    setDirty(false)
  }, [data])

  if (loading) return <SkeletonGrid />
  if (error) return <ErrorState message="We couldn't load your budget." onRetry={refetch} />

  const actualsByMonth = new Map((data?.actuals ?? []).map((m) => [m.month, m]))
  const currentYm = ymOfDate()
  const actualFor = (line: Line, m: string) => {
    const a = actualsByMonth.get(m)
    if (!a) return 0
    return line === 'REVENUE' ? a.revenue : line === 'COGS' ? a.cogs : a.opex
  }

  function setCell(month: string, line: Line, value: number) {
    setGrid((g) => ({ ...g, [gk(month, line)]: value }))
    setDirty(true)
  }

  // Seed empty cells from the trailing-3-month run-rate (rounded to $100).
  // Only fills blanks — never overwrites numbers you've already planned.
  function seedFromActuals() {
    const all = data?.actuals ?? []
    const trailing = all.slice(-3)
    if (trailing.length === 0) return
    const avg = (line: Line) =>
      Math.round(trailing.reduce((s, m) => s + actualFor(line, m.month), 0) / trailing.length / 100) * 100
    setGrid((g) => {
      const next = { ...g }
      for (const m of months) {
        for (const { key } of LINES) {
          const k = gk(m, key)
          if (next[k] == null || next[k] === 0 || Number.isNaN(next[k])) next[k] = avg(key)
        }
      }
      return next
    })
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const lines = Object.entries(grid)
        .map(([key, amount]) => {
          const [month, line] = key.split('|') as [string, Line]
          return { month, line, amount }
        })
        .filter((l) => Number.isFinite(l.amount))
      const res = await fetch('/api/model/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      if (!res.ok) throw new Error('Save failed')
      setDirty(false)
    } catch {
      setSaveError("Couldn't save the budget — please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Variance over CLOSED months only — the in-progress month would grade a
  // full-month budget against partial actuals (always "unfavorable" mid-month,
  // which teaches users to ignore the variance column). MTD shows separately.
  const elapsed = months.filter((m) => m < currentYm && actualsByMonth.has(m))
  const budgetYtd = (line: Line) => elapsed.reduce((s, m) => s + (grid[gk(m, line)] ?? 0), 0)
  const actualYtd = (line: Line) => elapsed.reduce((s, m) => s + actualFor(line, m), 0)

  const varianceColor = (line: Line, v: number) => {
    // Revenue: over budget is good. Costs: under budget is good.
    const good = line === 'REVENUE' ? v >= 0 : v <= 0
    return good ? 'var(--color-success)' : 'var(--color-danger)'
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface-input)',
    border: '1px solid var(--color-surface-border)',
    color: 'var(--color-text-primary)',
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card
        title={`Budget — ${year}`}
        subtitle="Enter the plan by month; actuals flow in from your live ledger"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExportLink year={year} />
            <ExportLink year={year} template />
            <ImportButton
              endpoint="/api/model/budget/import"
              onResult={(text, error) => {
                setImportNotice({ text, error })
                if (!error) refetch() // pull the upserted budget back into the grid
              }}
            />
            <select
              aria-label="Budget year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg px-2.5 py-1.5 text-sm"
              style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={seedFromActuals}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
              title="Fill empty cells with your trailing-3-month run-rate (never overwrites entered values)"
            >
              Seed from actuals
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-brand-blue)', color: '#fff' }}
            >
              <Save size={14} /> {saving ? 'Saving…' : dirty ? 'Save budget' : 'Saved'}
            </button>
          </div>
        }
      >
        <FreshnessLine meta={data?.meta} />
        {saveError && <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--color-danger)' }}>{saveError}</p>}
        {importNotice && (
          <p role={importNotice.error ? 'alert' : 'status'} className="mb-2 text-xs" style={{ color: importNotice.error ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {importNotice.text}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={`${th} text-left`}>&nbsp;</th>
                {months.map((m, i) => (
                  <th key={m} className={`${th} text-right`}>{MONTH_SHORT[i]}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ color: 'var(--color-text-primary)' }}>
              {LINES.map(({ key, label }) => (
                <tr key={key} className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <td className={`${td} font-medium`}>{label}</td>
                  {months.map((m) => (
                    <td key={m} className="px-1 py-1">
                      <input
                        aria-label={`${label} budget ${m}`}
                        type="number"
                        min={0}
                        className="w-24 rounded-md px-2 py-1 text-sm text-right"
                        style={inputStyle}
                        value={grid[gk(m, key)] ?? ''}
                        onChange={(e) => setCell(m, key, Number(e.target.value))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Monthly budget vs actuals"
        subtitle="Budget / Actual / Variance per line — actuals appear as months close"
        tooltip="Variance = actual − budget. Favorable is green: above budget for revenue, below budget for costs. Months without ledger actuals yet show —."
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={`${th} text-left`}>&nbsp;</th>
                {months.map((m, i) => (
                  <th key={m} className={`${th} text-right`}>
                    {MONTH_SHORT[i]}
                    {m === currentYm && <span className="font-normal"> (MTD)</span>}
                  </th>
                ))}
                <th className={`${th} text-right`} style={{ borderLeft: '1px solid var(--color-surface-border)' }}>FY</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--color-text-primary)' }}>
              {LINES.map(({ key, label }) => {
                const hasActual = (m: string) => actualsByMonth.has(m)
                const fyBudget = months.reduce((sum, m) => sum + (grid[gk(m, key)] ?? 0), 0)
                const fyActual = months.reduce((sum, m) => sum + (hasActual(m) ? actualFor(key, m) : 0), 0)
                return (
                  <Fragment key={key}>
                    <tr className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                      <td className={`${td} font-semibold`}>{label} — Budget</td>
                      {months.map((m) => (
                        <td key={m} className={`${td} text-right`}>{formatCurrency(grid[gk(m, key)] ?? 0, true)}</td>
                      ))}
                      <td className={`${td} text-right font-medium`} style={{ borderLeft: '1px solid var(--color-surface-border)' }}>{formatCurrency(fyBudget, true)}</td>
                    </tr>
                    <tr>
                      <td className={td} style={{ color: 'var(--color-text-secondary)' }}>{label} — Actual</td>
                      {months.map((m) => (
                        <td key={m} className={`${td} text-right`} style={{ color: 'var(--color-text-secondary)' }}>
                          {hasActual(m) ? formatCurrency(actualFor(key, m), true) : '—'}
                        </td>
                      ))}
                      <td className={`${td} text-right`} style={{ color: 'var(--color-text-secondary)', borderLeft: '1px solid var(--color-surface-border)' }}>{formatCurrency(fyActual, true)}</td>
                    </tr>
                    <tr>
                      <td className={`${td} text-xs`} style={{ color: 'var(--color-text-muted)' }}>{label} — Var</td>
                      {months.map((m) => {
                        // No actuals OR month still in progress → no variance verdict.
                        if (!hasActual(m) || m >= currentYm) return <td key={m} className={`${td} text-right text-xs`} style={{ color: 'var(--color-text-muted)' }}>—</td>
                        const v = actualFor(key, m) - (grid[gk(m, key)] ?? 0)
                        return (
                          <td key={m} className={`${td} text-right text-xs font-medium`} style={{ color: varianceColor(key, v) }}>
                            {v >= 0 ? '+' : ''}{formatCurrency(v, true)}
                          </td>
                        )
                      })}
                      {(() => {
                        const closed = months.filter((m) => m < currentYm && actualsByMonth.has(m))
                        const closedActual = closed.reduce((sum, m) => sum + actualFor(key, m), 0)
                        const v = closedActual - closed.reduce((sum, m) => sum + (grid[gk(m, key)] ?? 0), 0)
                        return (
                          <td className={`${td} text-right text-xs font-medium`} style={{ color: varianceColor(key, v), borderLeft: '1px solid var(--color-surface-border)' }}>
                            {v >= 0 ? '+' : ''}{formatCurrency(v, true)}
                          </td>
                        )
                      })()}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Budget vs actuals — YTD"
        subtitle={elapsed.length ? `Closed months through ${elapsed[elapsed.length - 1]} — the in-progress month is excluded` : 'No closed months with actuals in this year yet'}
        tooltip="Variance = actual − budget. Favorable shows green: above budget for revenue, below budget for costs."
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={`${th} text-left`}>Line</th>
                <th className={`${th} text-right`}>Budget YTD</th>
                <th className={`${th} text-right`}>Actual YTD</th>
                <th className={`${th} text-right`}>Variance</th>
                <th className={`${th} text-right`}>Var %</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--color-text-primary)' }}>
              {LINES.map(({ key, label }) => {
                const b = budgetYtd(key)
                const a = actualYtd(key)
                const v = a - b
                return (
                  <tr key={key} className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <td className={`${td} font-medium`}>{label}</td>
                    <td className={`${td} text-right`}>{formatCurrency(b)}</td>
                    <td className={`${td} text-right`}>{formatCurrency(a)}</td>
                    <td className={`${td} text-right font-medium`} style={{ color: varianceColor(key, v) }}>
                      {v >= 0 ? '+' : ''}{formatCurrency(v)}
                    </td>
                    <td className={`${td} text-right`} style={{ color: varianceColor(key, v) }}>
                      {b !== 0 ? `${((v / b) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
              {(() => {
                const bOI = budgetYtd('REVENUE') - budgetYtd('COGS') - budgetYtd('OPEX')
                const aOI = actualYtd('REVENUE') - actualYtd('COGS') - actualYtd('OPEX')
                const v = aOI - bOI
                return (
                  <tr className="border-t font-semibold" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <td className={td}>Operating Income</td>
                    <td className={`${td} text-right`}>{formatCurrency(bOI)}</td>
                    <td className={`${td} text-right`}>{formatCurrency(aOI)}</td>
                    <td className={`${td} text-right`} style={{ color: v >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {v >= 0 ? '+' : ''}{formatCurrency(v)}
                    </td>
                    <td className={`${td} text-right`} style={{ color: v >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {bOI !== 0 ? `${((v / Math.abs(bOI)) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
