import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classify } from '@/lib/metrics/classify'
import { categoryOverrides } from '@/lib/metrics/ledger'

/**
 * Recent transactions for the Expenses table — real rows from the ledger, each
 * tagged with the classifier's category (so the label matches the metric engine).
 * Supports `?limit=`, `?category=`, and `?month=YYYY-MM` (UTC month window)
 * filtering — the month filter powers the Expenses tab drill-down, where the
 * "recent 200" default would otherwise under-report older months.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const orgId = await getDefaultOrgId(user.id)

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 500)

    // Optional month scope — exact UTC month window, same convention as the
    // metric engine's 'YYYY-MM' bucketing.
    const month = searchParams.get('month')
    let dateWindow: { gte: Date; lt: Date } | undefined
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [y, mo] = month.split('-').map(Number)
      dateWindow = { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) }
    }

    const [rows, catOverrides] = await Promise.all([
      prisma.transaction.findMany({
        where: { orgId, ...(dateWindow ? { date: dateWindow } : {}) },
        orderBy: { date: 'desc' },
        take: limit,
        select: {
          id: true, date: true, description: true, amount: true,
          merchantName: true, type: true, source: true, category: true, externalId: true,
        },
      }),
      categoryOverrides(orgId), // user category fixes — applied everywhere
    ])

    const transactions = rows.map((r) => {
      const c = classify({
        source: r.source,
        type: r.type as 'CREDIT' | 'DEBIT',
        amount: r.amount,
        category: r.category,
        description: r.description,
        merchantName: r.merchantName,
      })
      const override = r.externalId ? catOverrides[r.externalId] : undefined
      const label =
        c.bucket === 'REVENUE' ? 'Revenue' :
        c.bucket === 'TRANSFER' ? 'Transfer' :
        (override ?? c.expenseCategory ?? 'Other')
      return {
        id: r.id,
        externalId: r.externalId,
        // Editable only for expenses; flag lets the UI mark user-fixed rows.
        editable: c.bucket === 'EXPENSE',
        overridden: !!override,
        date: r.date.toISOString(),
        description: r.description,
        amount: r.amount,
        merchantName: r.merchantName,
        type: r.type === 'CREDIT' ? 'credit' : 'debit',
        source: r.source,
        category: label,
      }
    })

    return Response.json({ transactions })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ transactions: [] })
  }
}
