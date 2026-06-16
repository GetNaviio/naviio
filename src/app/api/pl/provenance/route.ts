/**
 * Provenance drill-down: the transactions BEHIND a figure. Click "$48,210
 * expenses in May" → this returns the exact ledger rows that sum to it.
 *
 * The single most important property: the returned total must equal the
 * figure the user clicked, to the cent. That's only possible by using the
 * SAME pipeline as the metric engine — loadPrimaryLedger (deduplicated,
 * source-of-truth hierarchy) + the same classifier. Querying the raw
 * transactions table would double-count Stripe payouts and break trust in
 * the one feature whose job is proving trustworthiness.
 *
 * Query params:
 *   scope:    'month' | 'ytd'
 *   month:    'YYYY-MM' (required when scope=month)
 *   bucket:   'income' | 'expenses'
 *   category: optional expense-category label (only with bucket=expenses)
 */
import { z } from 'zod'
import { withOrg } from '@/lib/api/with-org'
import { loadPrimaryLedger, startOfYearUTC, categoryOverrides } from '@/lib/metrics/ledger'
import { classify, resolveVendorCategories, resolveTxnCategory } from '@/lib/metrics/classify'

const QuerySchema = z
  .object({
    scope: z.enum(['month', 'ytd']),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    bucket: z.enum(['income', 'expenses']),
    category: z.string().trim().min(1).max(80).optional(),
  })
  .refine((q) => q.scope !== 'month' || !!q.month, { message: 'month is required when scope=month' })

const round2 = (n: number) => Math.round(n * 100) / 100

export const GET = withOrg(async (request, { orgId }) => {
  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    scope: searchParams.get('scope') ?? undefined,
    month: searchParams.get('month') ?? undefined,
    bucket: searchParams.get('bucket') ?? undefined,
    category: searchParams.get('category') ?? undefined,
  })
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'invalid query' }, { status: 400 })
  }
  const q = parsed.data

  // Window: exact UTC month, or start-of-year → now. Same boundaries the
  // metric engine uses ('YYYY-MM' bucketing / startOfYearUTC).
  let from: Date
  let to: Date | null = null
  if (q.scope === 'month') {
    const [y, mo] = q.month!.split('-').map(Number)
    from = new Date(Date.UTC(y, mo - 1, 1))
    to = new Date(Date.UTC(y, mo, 1))
  } else {
    from = startOfYearUTC()
  }

  const [ledger, catOverrides] = await Promise.all([
    loadPrimaryLedger(orgId), // full ledger → consistent per-vendor categories
    categoryOverrides(orgId), // user category fixes (vendor-keyed) — applied everywhere
  ])

  // One category per vendor across the whole ledger — matches the metric engine.
  const vendorCat = resolveVendorCategories(ledger, catOverrides.byVendor)

  const wantBucket = q.bucket === 'income' ? 'REVENUE' : 'EXPENSE'
  const rows: {
    date: string
    description: string
    merchantName: string | null
    source: string
    amount: number
    category: string | null
  }[] = []
  let total = 0

  for (const t of ledger) {
    const d = t.date instanceof Date ? t.date : new Date(t.date)
    if (d.getTime() < from.getTime()) continue
    if (to && d.getTime() >= to.getTime()) continue
    const c = classify(t)
    if (c.bucket !== wantBucket) continue
    const label = c.bucket === 'EXPENSE' ? resolveTxnCategory(t, vendorCat, catOverrides.byTxn) : null
    if (q.category && label !== q.category) continue
    total += t.amount
    rows.push({
      date: d.toISOString(),
      description: t.description ?? '',
      merchantName: t.merchantName ?? null,
      source: t.source,
      amount: t.amount,
      category: label,
    })
  }

  // Newest first — the order a human audits in.
  rows.sort((a, b) => (a.date < b.date ? 1 : -1))

  return Response.json({
    rows,
    count: rows.length,
    total: round2(total),
    scope: q.scope,
    month: q.month ?? null,
    bucket: q.bucket,
    category: q.category ?? null,
    generatedAt: new Date().toISOString(),
  })
})
