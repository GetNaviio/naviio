import { prisma } from '@/lib/prisma'
import type { AccountingSummary } from './accounting-map'

/**
 * Pure synthesis math — given credit/debit totals, produce the P&L figures.
 * Separated so it can be unit-tested without a DB.
 */
export function synthesizePL(creditTotal: number, debitTotal: number): {
  totalIncome: number
  totalExpenses: number
  netIncome: number
} {
  return {
    totalIncome: creditTotal,
    totalExpenses: debitTotal,
    netIncome: creditTotal - debitTotal,
  }
}

/**
 * Best-effort P&L for orgs with NO accounting tool (QBO/Xero) connected, derived
 * from the persisted Transaction ledger (Stripe charges + Plaid bank activity).
 * Credits = income, debits = expenses, year-to-date. Returns null when there are
 * no transactions to work from. Approximate by design — labeled `synthesized`.
 */
export async function synthesizePLFromTransactions(orgId: string): Promise<AccountingSummary | null> {
  // UTC, matching startOfYearUTC in metrics/ledger.ts — local-time boundaries
  // silently shift the YTD window by the server's UTC offset.
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))

  const grouped = await prisma.transaction.groupBy({
    by: ['type'],
    where: { orgId, date: { gte: yearStart } },
    _sum: { amount: true },
  })
  if (grouped.length === 0) return null

  // groupBy bypasses the Decimal->number result extension, so convert here.
  const credit = Number(grouped.find((g) => g.type === 'CREDIT')?._sum.amount ?? 0)
  const debit = Number(grouped.find((g) => g.type === 'DEBIT')?._sum.amount ?? 0)
  if (credit === 0 && debit === 0) return null

  const { totalIncome, totalExpenses, netIncome } = synthesizePL(credit, debit)

  // Currency: take whatever the ledger uses (first row), default USD.
  const sample = await prisma.transaction.findFirst({ where: { orgId }, select: { currency: true } })

  return {
    source: 'synthesized',
    totalIncome,
    totalExpenses,
    netIncome,
    grossProfit: null,        // not derivable without COGS classification
    outstandingCount: null,   // no invoice ledger without an accounting tool
    outstandingAmount: null,
    currency: sample?.currency ?? 'USD',
  }
}
