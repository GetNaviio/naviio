import type { Prisma } from '@prisma/client'

/**
 * Pure mappers that turn raw QuickBooks/Xero *transactions* (not their computed
 * reports) into normalized Transaction rows for our ledger + metric engine.
 * Side-effect free so they unit-test without network or DB.
 *
 * These only feed the engine when Plaid/Stripe are NOT connected (see
 * `primaryLedger`), so the same bank activity is never double-counted.
 */

type Row = Prisma.TransactionUncheckedCreateInput

/** Xero classic API serializes dates as "/Date(ms+0000)/"; newer ones use ISO. */
export function parseXeroDate(s: string | undefined | null): Date {
  if (!s) return new Date(NaN)
  const m = /\/Date\((\d+)/.exec(s)
  return m ? new Date(Number(m[1])) : new Date(s)
}

interface XeroBankTxn {
  BankTransactionID?: string
  Type?: string            // RECEIVE* (money in) | SPEND* (money out)
  Total?: number
  Date?: string
  Reference?: string
  CurrencyCode?: string
  Contact?: { Name?: string }
  LineItems?: { AccountCode?: string; Description?: string }[]
  BankAccount?: { AccountID?: string }
}

/** Map a Xero BankTransaction. Returns null for transfers / unknown types. */
export function mapXeroBankTransaction(orgId: string, integrationId: string, bt: XeroBankTxn): Row | null {
  const type = (bt.Type ?? '').toUpperCase()
  const isReceive = type.startsWith('RECEIVE')
  const isSpend = type.startsWith('SPEND')
  if (!isReceive && !isSpend) return null
  if (!bt.BankTransactionID) return null
  // A row with an unparseable date can't be bucketed into any period — and an
  // Invalid Date is rejected by Prisma, which would fail the whole batched
  // sync transaction. Skip the row (it was never usable downstream).
  const date = parseXeroDate(bt.Date)
  if (Number.isNaN(date.getTime())) return null
  return {
    orgId,
    integrationId,
    externalId: `xero_${bt.BankTransactionID}`,
    date,
    amount: Math.abs(bt.Total ?? 0),
    currency: bt.CurrencyCode ?? 'USD',
    description: bt.Reference || bt.Contact?.Name || 'Xero transaction',
    category: bt.LineItems?.[0]?.AccountCode ? `XERO_${bt.LineItems[0].AccountCode}` : null,
    merchantName: bt.Contact?.Name ?? null,
    accountId: bt.BankAccount?.AccountID ?? null,
    type: isReceive ? 'CREDIT' : 'DEBIT',
    source: 'xero',
  }
}

// ─── QuickBooks ──────────────────────────────────────────────────────────────
// QBO has no single transaction list; we pull Purchase (money out) + Deposit and
// SalesReceipt (money in). Amounts are major units; TxnDate is YYYY-MM-DD.

interface QBOEntity {
  Id?: string
  TxnDate?: string
  TotalAmt?: number
  PrivateNote?: string
  CurrencyRef?: { value?: string }
  EntityRef?: { name?: string }
  Line?: { AccountBasedExpenseLineDetail?: { AccountRef?: { name?: string } } }[]
}

function qboRow(orgId: string, integrationId: string, e: QBOEntity, kind: 'PURCHASE' | 'DEPOSIT' | 'SALESRECEIPT'): Row | null {
  if (!e.Id) return null
  // No/unparseable TxnDate → skip (see Xero mapper: Invalid Date would fail the
  // whole batched sync and corrupt monthly bucketing).
  if (!e.TxnDate) return null
  const date = new Date(`${e.TxnDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const isIn = kind === 'DEPOSIT' || kind === 'SALESRECEIPT'
  return {
    orgId,
    integrationId,
    externalId: `qbo_${kind.toLowerCase()}_${e.Id}`,
    date,
    amount: Math.abs(e.TotalAmt ?? 0),
    currency: e.CurrencyRef?.value ?? 'USD',
    description: e.PrivateNote || e.EntityRef?.name || `QuickBooks ${kind.toLowerCase()}`,
    category: e.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name
      ? `QBO_${e.Line[0].AccountBasedExpenseLineDetail!.AccountRef!.name}`
      : null,
    merchantName: e.EntityRef?.name ?? null,
    accountId: null,
    type: isIn ? 'CREDIT' : 'DEBIT',
    source: 'quickbooks',
  }
}

export const mapQBOPurchase = (o: string, i: string, e: QBOEntity) => qboRow(o, i, e, 'PURCHASE')
export const mapQBODeposit = (o: string, i: string, e: QBOEntity) => qboRow(o, i, e, 'DEPOSIT')
export const mapQBOSalesReceipt = (o: string, i: string, e: QBOEntity) => qboRow(o, i, e, 'SALESRECEIPT')
