'use client'

import { useCallback, useState } from 'react'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import { SkeletonGrid, ErrorState, EmptyState } from '@/components/ui/PageState'
import { usePageData, fetchJson } from '@/hooks/usePageData'
import { formatCurrency } from '@/lib/utils'
import {
  loadedMonthlyCost,
  workforceSeries,
  monthKeys,
  ymOfDate,
  type PlannedRole,
} from '@/lib/model/workforce'
import { Users, Trash2, Plus } from 'lucide-react'
import { ExportLink, ImportButton } from './SheetSync'

export interface RoleRow extends PlannedRole {
  id: string
  department?: string | null
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

const th = 'px-3 py-2 text-xs font-semibold text-left whitespace-nowrap'
const td = 'px-3 py-2 text-sm whitespace-nowrap'

export default function WorkforceTab() {
  const { data, loading, error, refetch } = usePageData(
    useCallback((signal: AbortSignal) => fetchJson<{ roles: RoleRow[] }>('/api/model/workforce', signal), []),
  )
  const roles = data?.roles ?? []

  // Add-role form
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [headcount, setHeadcount] = useState(1)
  const [salary, setSalary] = useState(8000)
  const [loadedPct, setLoadedPct] = useState(25)
  const [startMonth, setStartMonth] = useState(ymOfDate())
  const [endMonth, setEndMonth] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append')
  const [importNotice, setImportNotice] = useState<{ text: string; error: boolean } | null>(null)

  async function addRole() {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/model/workforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          department: department || null,
          headcount,
          monthlySalary: salary,
          loadedPct,
          startMonth,
          endMonth: endMonth || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Could not save the role')
      }
      setTitle('')
      refetch()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save the role')
    } finally {
      setSaving(false)
    }
  }

  async function removeRole(id: string) {
    await fetch(`/api/model/workforce?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    refetch()
  }

  if (loading) return <SkeletonGrid />
  if (error) return <ErrorState message="We couldn't load your workforce plan." onRetry={refetch} />

  const now = ymOfDate()
  const months = monthKeys(now, 12)
  const series = workforceSeries(roles, months)
  const current = series[0]
  const in12 = series[series.length - 1]

  const inputStyle = {
    backgroundColor: 'var(--color-surface-input)',
    border: '1px solid var(--color-surface-border)',
    color: 'var(--color-text-primary)',
  }
  const input = 'rounded-lg px-2.5 py-1.5 text-sm w-full focus-visible:outline focus-visible:outline-2'

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Current monthly cost"
          value={formatCurrency(current?.cost ?? 0, true)}
          subtitle={`${current?.headcount ?? 0} planned heads`}
          icon={<Users size={16} style={{ color: '#3B82F6' }} />}
          iconBg="rgba(59,130,246,0.15)"
          tooltip="Fully-loaded monthly cost of all roles active this month: headcount × salary × (1 + loaded %)."
        />
        <MetricCard
          title="Cost in 12 months"
          value={formatCurrency(in12?.cost ?? 0, true)}
          subtitle={`${in12?.headcount ?? 0} planned heads`}
          icon={<Users size={16} style={{ color: '#8B5CF6' }} />}
          iconBg="rgba(139,92,246,0.15)"
          tooltip="Planned run-rate at the end of the 12-month horizon."
        />
        <MetricCard
          title="12-month plan total"
          value={formatCurrency(series.reduce((a, s) => a + s.cost, 0), true)}
          icon={<Users size={16} style={{ color: '#14B8A6' }} />}
          iconBg="rgba(20,184,166,0.15)"
          tooltip="Sum of planned loaded cost across the next 12 months."
        />
      </div>

      <Card
        title="Planned roles"
        subtitle="Loaded cost = headcount × monthly salary × (1 + loaded %)"
        tooltip="The plan feeds the TTM Forecast tab: hires starting after this month add their loaded cost to forecast OpEx."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExportLink />
            <ExportLink template />
            <select
              aria-label="Import mode"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
              title="Append adds rows to the current plan; Replace swaps the whole plan for the file's rows (atomic)"
            >
              <option value="append">Append</option>
              <option value="replace">Replace plan</option>
            </select>
            <ImportButton
              endpoint="/api/model/workforce/import"
              fields={{ mode: importMode }}
              onResult={(text, error) => {
                setImportNotice({ text, error })
                if (!error) refetch()
              }}
            />
          </div>
        }
      >
        {importNotice && (
          <p role={importNotice.error ? 'alert' : 'status'} className="mb-2 text-xs" style={{ color: importNotice.error ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {importNotice.text}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={th}>Role</th>
                <th className={th}>Dept</th>
                <th className={th}>Heads</th>
                <th className={th}>Salary / mo</th>
                <th className={th}>Loaded %</th>
                <th className={th}>Start</th>
                <th className={th}>End</th>
                <th className={`${th} text-right`}>Loaded / mo</th>
                <th className={th} aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-primary)' }}>
                  <td className={td}>{r.title}</td>
                  <td className={td} style={{ color: 'var(--color-text-secondary)' }}>{r.department || '—'}</td>
                  <td className={td}>{r.headcount}</td>
                  <td className={td}>{formatCurrency(r.monthlySalary)}</td>
                  <td className={td}>{r.loadedPct}%</td>
                  <td className={td}>{monthLabel(r.startMonth)}</td>
                  <td className={td}>{r.endMonth ? monthLabel(r.endMonth) : '—'}</td>
                  <td className={`${td} text-right font-medium`}>{formatCurrency(loadedMonthlyCost(r))}</td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      onClick={() => removeRole(r.id)}
                      aria-label={`Remove ${r.title}`}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {(() => {
                // Department subtotals — shown once more than one department exists.
                const depts = new Map<string, { cost: number; heads: number }>()
                for (const r of roles) {
                  const key = r.department?.trim() || 'Unassigned'
                  const cur = depts.get(key) ?? { cost: 0, heads: 0 }
                  cur.cost += loadedMonthlyCost(r)
                  cur.heads += r.headcount
                  depts.set(key, cur)
                }
                if (depts.size <= 1) return null
                return [...depts.entries()].map(([dept, v]) => (
                  <tr key={`dept-${dept}`} className="border-t" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                    <td className={`${td} text-xs font-semibold`} colSpan={2}>Σ {dept}</td>
                    <td className={`${td} text-xs`}>{v.heads}</td>
                    <td colSpan={3} />
                    <td className={`${td} text-right text-xs font-semibold`}>{formatCurrency(v.cost)}</td>
                    <td />
                  </tr>
                ))
              })()}
              {roles.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6">
                    <EmptyState message="No planned roles yet — add your first hire below to see its cost flow into the TTM forecast." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add-role form */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-8 gap-2 items-end">
          <label className="col-span-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Role title
            <input className={input} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Engineer" />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Dept
            <input className={input} style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Eng" />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Heads
            <input className={input} style={inputStyle} type="number" min={1} value={headcount} onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Salary / mo
            <input className={input} style={inputStyle} type="number" min={0} value={salary} onChange={(e) => setSalary(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Loaded %
            <input className={input} style={inputStyle} type="number" min={0} max={200} value={loadedPct} onChange={(e) => setLoadedPct(Number(e.target.value))} />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Start
            <input className={input} style={inputStyle} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </label>
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            End (optional)
            <input className={input} style={inputStyle} type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </label>
        </div>
        {formError && (
          <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>{formError}</p>
        )}
        <button
          type="button"
          onClick={addRole}
          disabled={saving || !title.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-brand-blue)', color: '#fff' }}
        >
          <Plus size={14} /> {saving ? 'Adding…' : 'Add role'}
        </button>
      </Card>

      <Card title="Planned cost by month" subtitle="Next 12 months — months on columns">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className={th}>&nbsp;</th>
                {series.map((s) => (
                  <th key={s.month} className={`${th} text-right`}>{monthLabel(s.month)}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ color: 'var(--color-text-primary)' }}>
              <tr className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                <td className={`${td} font-medium`}>Headcount</td>
                {series.map((s) => (
                  <td key={s.month} className={`${td} text-right`}>{s.headcount}</td>
                ))}
              </tr>
              <tr className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                <td className={`${td} font-medium`}>Loaded cost</td>
                {series.map((s) => (
                  <td key={s.month} className={`${td} text-right`}>{formatCurrency(s.cost, true)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
