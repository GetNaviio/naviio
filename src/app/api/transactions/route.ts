import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { classify, classifyWithOverride, resolveVendorCategories, resolveTxnCategoryDetailed, vendorKey } from '@/lib/metrics/classify'
import { classifyExpense } from '@/lib/model/cogs'
import { loadPrimaryLedger, categoryOverrides, classificationOverrides } from '@/lib/metrics/ledger'
import { getCommunityPrior } from '@/lib/metrics/community'
import { detectRecurring, recurringVendorKeys } from '@/lib/metrics/recurrence'

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

    const [rows, fullLedger, catOverrides, classOverrides, community] = await Promise.all([
      prisma.transaction.findMany({
        where: { orgId, ...(dateWindow ? { date: dateWindow } : {}) },
        orderBy: { date: 'desc' },
        take: limit,
        select: {
          id: true, date: true, description: true, amount: true,
          merchantName: true, type: true, source: true, category: true, externalId: true,
        },
      }),
      loadPrimaryLedger(orgId), // full ledger → consistent per-vendor categories
      categoryOverrides(orgId), // user category fixes (vendor-keyed) — applied everywhere
      classificationOverrides(orgId), // COGS/OpEx fixes — applied everywhere
      getCommunityPrior(), // cross-org prior to fill vendors heuristics can't name
    ])

    // One category per vendor across the whole ledger — matches the metric engine.
    const vendorCat = resolveVendorCategories(fullLedger, catOverrides.byVendor, community)
    const overrideVendors = new Set(Object.keys(catOverrides.byVendor))
    // Recurring streams flag likely-commitment outflows (payroll/rent/SaaS) so
    // the UI can prioritize the review queue, even for unknown merchants.
    const recurring = recurringVendorKeys(detectRecurring(fullLedger))

    const transactions = rows.map((r) => {
      const ledgerTxn = {
        source: r.source,
        type: r.type as 'CREDIT' | 'DEBIT',
        amount: r.amount,
        category: r.category,
        description: r.description,
        merchantName: r.merchantName,
        externalId: r.externalId,
      }
      const c = classify(ledgerTxn)
      // Effective bucket honors a user cross-bucket override (transfer→expense, or
      // exclude→transfer) so a reclassified row appears on the right tab.
      const userOverride = (r.externalId && catOverrides.byTxn[r.externalId]) || catOverrides.byVendor[vendorKey(ledgerTxn)] || null
      const eff = classifyWithOverride(ledgerTxn, userOverride)
      const isExpense = eff.bucket === 'EXPENSE'
      const classOverride = r.externalId ? classOverrides[r.externalId] : undefined
      const resolved = resolveTxnCategoryDetailed(ledgerTxn, vendorCat, catOverrides.byTxn, { overrideVendors, community })
      const label =
        eff.bucket === 'REVENUE' ? 'Revenue' :
        eff.bucket === 'TRANSFER' ? 'Transfer' :
        resolved.category
      // Marked as user-fixed when a per-transaction OR vendor override applies.
      const overridden = isExpense && (
        (!!r.externalId && !!catOverrides.byTxn[r.externalId]) ||
        !!catOverrides.byVendor[vendorKey(ledgerTxn)]
      )
      // For expense rows, resolve COGS vs OpEx (user override > heuristic) so the
      // Expenses table can show and let the user fix the gross-margin split.
      const { expenseClass } = isExpense
        ? classifyExpense(ledgerTxn, classOverride ?? null)
        : { expenseClass: null }
      return {
        id: r.id,
        externalId: r.externalId,
        // Editable only for expenses; flag lets the UI mark user-fixed rows.
        editable: isExpense,
        overridden,
        date: r.date.toISOString(),
        description: r.description,
        amount: r.amount,
        merchantName: r.merchantName,
        type: r.type === 'CREDIT' ? 'credit' : 'debit',
        source: r.source,
        category: label,
        // Trust signals for the review queue + UI.
        confidence: isExpense ? resolved.confidence : 1,
        categorySource: isExpense ? resolved.source : c.source,
        needsReview: isExpense && !overridden && resolved.needsReview,
        recurring: recurring.has(vendorKey(ledgerTxn)),
        // Gross-margin split for expense rows (null for revenue/transfers).
        expenseClass,
        cogsOverridden: !!classOverride,
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
