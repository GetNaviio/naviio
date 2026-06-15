import Anthropic from '@anthropic-ai/sdk'
import { withOrg } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { ymOfDate } from '@/lib/model/workforce'
import { chargeCredits, addCredits, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'
import { loadPrimaryLedger, startOfYearUTC } from '@/lib/metrics/ledger'
import { cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'
import { modelIncomeStatement, type ModelTxn } from '@/lib/model/incomeStatement'
import { cleanNaviText } from '@/lib/naviFormat'

const usd = (n: number | null | undefined) =>
  n == null ? 'n/a' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const pct = (n: number | null) => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`)

/**
 * Latest saved commentary — generation is PAID (2 credits), so the result is
 * persisted and reloaded; navigating away never costs the user their output.
 */
export const GET = withOrg(async (_request, { orgId }) => {
  const saved = await prisma.report.findFirst({
    where: { orgId, type: 'COMMENTARY' },
    orderBy: { generatedAt: 'desc' },
    select: { data: true, generatedAt: true },
  })
  const commentary = saved && typeof saved.data === 'object' && saved.data !== null && 'commentary' in saved.data
    ? String((saved.data as { commentary?: unknown }).commentary ?? '')
    : null
  return Response.json({ commentary: commentary || null, generatedAt: saved?.generatedAt?.toISOString() ?? null })
})

/** AI Commentary Writer — board-ready analysis of the live financials (metered, 2 credits). */
export const POST = withOrg(async (_request, { orgId }) => {

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'AI is not configured (no ANTHROPIC_API_KEY).' }, { status: 503 })

  const ledger = await loadPrimaryLedger(orgId, startOfYearUTC())
  if (ledger.length === 0) {
    return Response.json({ error: 'No financial data connected yet — connect a bank or Stripe first.' }, { status: 400 })
  }
  const model = modelIncomeStatement(ledger as ModelTxn[])
  const cf = cashFlow(ledger)
  const cash = await getCashBalance(orgId).catch(() => null)
  const runway = cash != null && cf.burnRate > 0 ? runwayMonths(cash, cf.burnRate) : null

  const snapshot = `LIVE FINANCIAL SNAPSHOT — cash basis, year-to-date:
- Revenue: ${usd(model.revenue)}
- COGS: ${usd(model.cogs)}
- Gross profit: ${usd(model.grossProfit)} (gross margin ${pct(model.grossMargin)})
- Operating expenses: ${usd(model.opex)}
- Operating income: ${usd(model.operatingIncome)} (operating margin ${pct(model.operatingMargin)})
- Cash balance: ${usd(cash)}
- Monthly burn: ${cf.burnRate > 0 ? usd(cf.burnRate) : 'cash positive'}
- Runway: ${runway == null ? 'n/a (cash positive or no measurable burn)' : `${runway} months`}`

  // Charge first; refund if the model call fails.
  try {
    await chargeCredits(orgId, 'commentary')
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return Response.json({ error: "You're out of credits. Reload to generate commentary.", needed: e.needed, balance: e.balance }, { status: 402 })
    }
    throw e
  }

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system:
        'You are Navi, a CFO-level analyst writing board-ready commentary for a small-business owner. ' +
        'Write a concise, specific executive commentary on the financials provided, covering: overall performance, ' +
        'profitability and margins, cash position and runway, and 2-3 concrete recommendations. Use ONLY the figures ' +
        'given — never invent numbers. This is cash basis; note that where relevant. Plain text only: no markdown, no ' +
        'asterisks, no "#" headers, no emojis. Organize into short labeled sections (a plain label line ending in a colon) ' +
        'separated by a single blank line.',
      messages: [{ role: 'user', content: snapshot }],
    })
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    const commentary = cleanNaviText(text)
    // Persist — the user paid for this; it must still be there when they come
    // back. A save failure must not eat the response they were charged for.
    const generatedAt = new Date()
    await prisma.report
      .create({ data: { orgId, type: 'COMMENTARY', period: ymOfDate(generatedAt), data: { commentary }, generatedAt } })
      .catch((e) => console.error('commentary persist failed (response still returned):', e))
    return Response.json({ commentary, generatedAt: generatedAt.toISOString() })
  } catch (err) {
    await addCredits(orgId, costOf('commentary'), 'refund', { feature: 'commentary' }).catch(() => {})
    console.error('commentary failed:', err)
    return Response.json({ error: 'Could not generate commentary — you were not charged.' }, { status: 502 })
  }
})
