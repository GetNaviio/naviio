import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { requireAuth, getDefaultOrgId, verifyToken } from '@/lib/auth'
import { chargeCredits, addCredits, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'
import { loadPrimaryLedger, startOfYearUTC, connectedProviders, monthsAgoUTC } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'

const IDENTITY = `You are Navi, the financial intelligence assistant inside Naviio — a CFO-level financial co-pilot for small and mid-sized businesses. You are speaking with the account owner.

Be specific and operator-level: use their ACTUAL numbers from the LIVE SNAPSHOT below, keep answers concise and actionable. You are not a licensed CPA or attorney — for filing or legal decisions, tell them to confirm with a professional.

CRITICAL: The snapshot is computed live from the user's connected accounts on a CASH BASIS (revenue when received, expense when paid — not GAAP accrual). NEVER invent figures. If the data needed to answer isn't in the snapshot, say plainly what's missing and what to connect, then give general guidance from first principles without stating specific numbers about their business.

FORMAT — follow these exactly:
- Write in plain text only. Do NOT use markdown. No asterisks, no bold or italics, no "#" headers, no backticks, no tables, no "---" rules.
- Do NOT use emojis or decorative symbols of any kind.
- Organize the answer by topic. Begin each topic with a short plain-text label line ending in a colon (for example "Your tax position:"). Put the details on the following lines, indented by three spaces.
- Separate each topic from the next with a single blank line.
- Keep it tight and scannable: short sentences, no filler. Lead with the answer, then the supporting detail.
- If you list items, put each on its own line indented by three spaces — do not use markdown bullet characters.`

const usd = (n: number | null | undefined) =>
  n == null ? 'n/a' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/** Build Navi's system context from the org's LIVE metric engine — no demo data. */
async function buildSystemPrompt(orgId: string): Promise<string> {
  const ledger = await loadPrimaryLedger(orgId, monthsAgoUTC(12))
  const is = incomeStatement(ledger, startOfYearUTC())
  const cf = cashFlow(ledger)
  const providers = await connectedProviders(orgId)
  const connected = [...providers].join(', ') || 'none'
  const plaid = providers.has('PLAID')
  const cash = plaid ? await getCashBalance(orgId).catch(() => null) : null
  const runway = cash != null && cf.burnRate > 0 ? runwayMonths(cash, cf.burnRate) : null

  if (ledger.length === 0 && cash == null) {
    return `${IDENTITY}

LIVE SNAPSHOT: No financial data is connected yet (connected integrations: ${connected}). Guide the user to connect their bank (Plaid), payments (Stripe), or accounting (QuickBooks/Xero) in the Integrations tab so you can answer from real numbers. Do NOT state any specific figures about their business.`
  }

  return `${IDENTITY}

LIVE SNAPSHOT — cash basis, year-to-date unless noted (connected: ${connected}):
- Total income (YTD): ${usd(is.totalIncome)}
- Total expenses (YTD): ${usd(is.totalExpenses)}
- Net income (YTD): ${usd(is.netIncome)}
- Net margin: ${is.netMargin != null ? `${is.netMargin.toFixed(1)}%` : 'n/a'}
- Cash balance: ${usd(cash)}
- Monthly burn: ${cf.burnRate > 0 ? usd(cf.burnRate) : 'cash positive'}
- Runway: ${runway == null ? 'n/a (cash positive or no measurable burn)' : `${runway} months`}`
}

export async function POST(request: Request) {
  let orgId: string
  let user
  try {
    user = await requireAuth()
  } catch {
    // Log the precise reason server-side (no cookie vs invalid/expired) for
    // debugging, but return a generic message — don't disclose token validity.
    const jar = await cookies()
    const token = jar.get('markup_session')?.value
    const diag = !token ? 'no session cookie' : verifyToken(token) ? 'valid token, no user' : 'invalid/expired token'
    console.warn('Navi chat unauthorized:', diag)
    return Response.json({ error: 'Please sign in to chat with Navi.' }, { status: 401 })
  }
  try {
    orgId = await getDefaultOrgId(user.id)
  } catch (e) {
    console.error('Navi getDefaultOrgId failed:', e)
    return Response.json({ error: `Could not resolve your organization: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 500 })
  }
  const { messages } = await request.json()

  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'messages array required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Demo mode: echo a canned response
    const demoStream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const text =
          "Navi is in demo mode — set an ANTHROPIC_API_KEY to enable live responses. Once enabled, I answer using your real, connected financial data — never made-up numbers."
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`))
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(demoStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const client = new Anthropic({ apiKey })

  let system: string
  try {
    system = await buildSystemPrompt(orgId)
  } catch (err) {
    console.error('Navi buildSystemPrompt failed:', err)
    return Response.json(
      { error: `Could not load your financial snapshot: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 },
    )
  }

  // Meter the message on credits. Charge AFTER the snapshot builds (so a failed
  // snapshot is never billed) but BEFORE streaming; refund if the model errors.
  try {
    await chargeCredits(orgId, 'navi_message')
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return Response.json(
        { error: "You're out of credits. Add credits to keep chatting with Navi.", needed: e.needed, balance: e.balance },
        { status: 402 },
      )
    }
    throw e
  }

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  })

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      let gotText = false
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            gotText = true
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }
        // Refund if the model produced no text at all — don't charge for an empty reply.
        if (!gotText) {
          await addCredits(orgId, costOf('navi_message'), 'refund', { feature: 'navi_message' }).catch(() => {})
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
      } catch (err) {
        console.error('Navi stream error:', err)
        // Refund the credit — the user shouldn't pay for a failed reply.
        await addCredits(orgId, costOf('navi_message'), 'refund', { feature: 'navi_message' }).catch(() => {})
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
