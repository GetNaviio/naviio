import type { Transaction as PlaidTransaction } from 'plaid'
import type { Prisma } from '@prisma/client'

/**
 * Map a Plaid transaction to a Naviio Transaction row. Pure + side-effect free
 * so it can be unit tested without a DB or the Plaid client.
 *
 * Plaid sign convention: a POSITIVE amount means money moving OUT of the account
 * (a debit / outflow); a NEGATIVE amount means money coming IN (a credit /
 * inflow). We store the magnitude in `amount` and capture direction in `type`.
 */
export function mapPlaidTransaction(
  orgId: string,
  integrationId: string,
  t: PlaidTransaction,
): Prisma.TransactionUncheckedCreateInput {
  return {
    orgId,
    integrationId,
    externalId: t.transaction_id,
    date: new Date(t.date),
    amount: Math.abs(t.amount),
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? 'USD',
    description: t.name,
    category: t.personal_finance_category?.primary ?? t.category?.[0] ?? null,
    merchantName: t.merchant_name ?? null,
    accountId: t.account_id,
    type: t.amount >= 0 ? 'DEBIT' : 'CREDIT',
    source: 'plaid',
  }
}
