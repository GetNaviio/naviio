'use client'

/**
 * Read-only transaction ledger scoped to one bucket (Revenue or Transfer).
 * Gives revenue rows a home on the Revenue tab and transfers a home on Cash
 * Flow, so the Expenses tab can stay expenses-only. Reclassification stays on
 * the Expenses tab (only expense categories are user-editable today).
 */
import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types'

export default function LedgerList({
  title, subtitle, category, tooltip, emptyText,
}: {
  title: string
  subtitle?: string
  category: 'Revenue' | 'Transfer'
  tooltip?: string
  emptyText?: string
}) {
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = () => {
      setLoading(true)
      fetch('/api/transactions?limit=200')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) { setRows((d?.transactions ?? []).filter((t: Transaction) => t.category === category)); setLoading(false) } })
        .catch(() => { if (alive) setLoading(false) })
    }
    load()
    // Re-pull after a sync/reclassify elsewhere updates the ledger.
    const onRefresh = () => load()
    window.addEventListener('naviio:refresh', onRefresh)
    return () => { alive = false; window.removeEventListener('naviio:refresh', onRefresh) }
  }, [category])

  const isRevenue = category === 'Revenue'
  const inColor = '#10B981'

  return (
    <Card title={title} subtitle={subtitle} tooltip={tooltip} padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
              {['Date', 'Description', 'Amount'].map((h) => (
                <th key={h} className={`px-4 py-3 font-medium ${h === 'Amount' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {loading ? 'Loading…' : (emptyText ?? `No ${isRevenue ? 'revenue' : 'transfer'} transactions yet.`)}
              </td></tr>
            ) : (
              rows.map((tx, i) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--color-surface-border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-surface-bg)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{tx.description}</p>
                    {tx.merchantName && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{tx.merchantName}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: tx.type === 'credit' ? inColor : 'var(--color-text-secondary)' }}>
                    {tx.type === 'credit' ? '+' : '−'}{formatCurrency(tx.amount, true)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
