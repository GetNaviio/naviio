/**
 * Navi agent endpoint — the in-product, tool-using Navi.
 *
 * Streams Server-Sent Events:
 *   {"tool": "<label>"}  — activity while a tool runs (progressive feedback)
 *   {"text": "<answer>"} — the final plain-text answer
 *   {"error": "..."}     — failure (credit is refunded)
 *   [DONE]               — stream end
 *
 * Metered one `navi_message` per turn; refunded if the agent produces no answer
 * or errors. Org-scoped via the authenticated session — the model never sees the
 * orgId; tools receive it from here.
 */
import { cookies } from 'next/headers'
import { requireAuth, getDefaultOrgId, verifyToken } from '@/lib/auth'
import { chargeCredits, addCredits, InsufficientCreditsError } from '@/lib/credits/account'
import { costOf } from '@/lib/credits/rates'
import { runNaviAgent } from '@/lib/navi/agent'

const SYSTEM = `You are Navi, the financial-intelligence agent inside Naviio — a CFO-level co-pilot for small and mid-sized businesses. You are talking to the account owner.

You have TOOLS that read the user's live, connected financial data and run a deterministic decision engine. Use them:
- For ANY figure about this business (income, expenses, net, margin, cash, burn, runway, MRR, ARR, churn, customers, LTV, spend by category, specific transactions) you MUST call a tool and use its result. NEVER state a number you did not get from a tool.
- For affordability, equipment/ROI, or runway "what-if" questions, call run_decision (the deterministic engine) rather than doing the arithmetic yourself.
- If a tool reports something isn't connected, say plainly what to connect (the Integrations tab) and give general guidance without inventing figures.
- You may call multiple tools before answering; keep going until you can answer concretely, then stop.

You can also PROPOSE actions when the user asks you to change something: trigger_sync (re-pull and refresh their data), reclassify_transaction (fix a transaction or vendor's category — get the externalId from recent_transactions first), and create_scenario (save a custom forecast scenario with growth/churn/opex multipliers). Calling an action tool does NOT run it: the user sees a confirm button and decides. Before proposing, say in one short line what you're about to do and why. Never propose money movement or account/settings changes — you have no such tools.

You are not a licensed CPA or attorney — for filing or legal decisions, tell them to confirm with a professional. Figures are cash-basis unless a tool says otherwise.

FORMAT — plain text only. No markdown, no asterisks, no "#" headers, no backticks, no tables, no emojis. Organize by topic: a short label line ending in a colon, then details on the next lines indented by three spaces, with a blank line between topics. Lead with the answer, then the detail. Keep it tight and scannable.`

export async function POST(request: Request) {
  let user
  try {
    user = await requireAuth()
  } catch {
    const jar = await cookies()
    const token = jar.get('markup_session')?.value
    console.warn('Navi agent unauthorized:', !token ? 'no cookie' : verifyToken(token) ? 'valid token, no user' : 'invalid/expired token')
    return Response.json({ error: 'Please sign in to chat with Navi.' }, { status: 401 })
  }

  let orgId: string
  try {
    orgId = await getDefaultOrgId(user.id)
  } catch (e) {
    return Response.json({ error: `Could not resolve your organization: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 500 })
  }

  const { messages } = await request.json().catch(() => ({ messages: null }))
  if (!Array.isArray(messages)) return Response.json({ error: 'messages array required' }, { status: 400 })
  const convo = messages
    .filter((m: { role?: string; content?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))

  if (!process.env.ANTHROPIC_API_KEY) {
    const demo = new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        c.enqueue(enc.encode(`data: ${JSON.stringify({ text: 'Navi is in demo mode — set ANTHROPIC_API_KEY to enable the live agent. It answers using your real connected data and the deterministic engine, never made-up numbers.' })}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
      },
    })
    return new Response(demo, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  }

  // Meter the turn; refund if the agent yields no answer or throws.
  try {
    await chargeCredits(orgId, 'navi_message')
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return Response.json({ error: "You're out of credits. Add credits to keep chatting with Navi.", needed: e.needed, balance: e.balance }, { status: 402 })
    }
    throw e
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        const { text } = await runNaviAgent({
          orgId,
          userId: user.id,
          system: SYSTEM,
          messages: convo,
          cb: {
            onTool: (label) => send({ tool: label }),
            onText: (t) => { if (t) send({ text: t }) },
            onProposedAction: (a) => send({ proposedAction: a }),
          },
        })
        // No answer produced → don't bill for an empty reply.
        if (!text) await addCredits(orgId, costOf('navi_message'), 'refund', { feature: 'navi_message' }).catch(() => {})
      } catch (err) {
        console.error('Navi agent error:', err)
        await addCredits(orgId, costOf('navi_message'), 'refund', { feature: 'navi_message' }).catch(() => {})
        send({ error: err instanceof Error ? err.message : 'Navi hit an error' })
      } finally {
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
