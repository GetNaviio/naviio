import { generateForecast } from '@/lib/forecasting/engine'
import { requireAuth } from '@/lib/auth'

export async function GET(request: Request) {
  try { await requireAuth() } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const { searchParams } = new URL(request.url)
    const months      = Math.min(Math.max(parseInt(searchParams.get('months') ?? '12'), 3), 24)
    const growthParam = searchParams.get('growthRate')
    const churnParam  = searchParams.get('churnRate')

    const customGrowthRate = growthParam ? parseFloat(growthParam) / 100 : undefined
    const customChurnRate  = churnParam  ? parseFloat(churnParam)  / 100 : undefined

    const result = generateForecast(months, customGrowthRate, customChurnRate)
    return Response.json(result)
  } catch (err) {
    console.error('Forecast error:', err)
    return Response.json({ error: 'Forecast failed' }, { status: 500 })
  }
}
