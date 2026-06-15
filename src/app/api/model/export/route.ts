import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { buildModelWorkbook, type ModelAssumptions } from '@/lib/model/export'

const clamp = (n: unknown, min: number, max: number, dflt: number): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : dflt
  return Math.min(max, Math.max(min, x))
}

/** Export the financial model as a live-formula .xlsx built from posted assumptions. */
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    await getDefaultOrgId(user.id)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const b = await request.json().catch(() => ({}))
  const a: ModelAssumptions = {
    months: Math.round(clamp(b.months, 1, 60, 12)),
    startRevenue: clamp(b.startRevenue, 0, 1e12, 0),
    growthPct: clamp(b.growthPct, -100, 1000, 5),
    grossMarginPct: clamp(b.grossMarginPct, 0, 100, 70),
    startOpex: clamp(b.startOpex, 0, 1e12, 0),
    opexGrowthPct: clamp(b.opexGrowthPct, -100, 1000, 2),
  }

  const buf = await buildModelWorkbook(a)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="naviio-financial-model.xlsx"',
    },
  })
}
