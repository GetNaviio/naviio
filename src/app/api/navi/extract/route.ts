/**
 * LLM slot extraction — the fallback when the deterministic regex extractor
 * can't read a free-form reply (e.g. "we charge two grand a session and keep
 * about two-thirds"). The model ONLY extracts values the user actually stated;
 * it never invents numbers, and the decision math is still done by the engine.
 * Falls back to the deterministic extractor when no API key or on any error.
 */
import Anthropic from '@anthropic-ai/sdk'
import { withOrg } from '@/lib/api/with-org'
import { extractSlots } from '@/lib/decisions/parse'

const TEMPLATES = ['affordability', 'capex', 'runway_path'] as const
type Template = (typeof TEMPLATES)[number]

const KEY_UNITS: Record<string, string> = {
  price: 'USD number',
  amount: 'USD number (one-time cost)',
  recurringMonthly: 'USD per month (recurring cost)',
  avgRevenuePerUnit: 'USD per unit/client/job/treatment',
  grossMarginPct: 'decimal 0–1 (e.g. 0.68 for 68%)',
  unitsPerMonth: 'integer count per month',
}

function allowedKeys(template: Template, missing: string[]): Set<string> {
  const set = new Set(missing)
  if (template === 'affordability') { set.add('amount'); set.add('recurringMonthly') }
  return set
}

/** Keep only allowed, finite numbers; normalize a percent given as 68 → 0.68. */
function sanitize(obj: Record<string, unknown>, allowed: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!allowed.has(k)) continue
    let n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!Number.isFinite(n)) continue
    if (k === 'grossMarginPct') { if (n > 1) n = n / 100; n = Math.max(0, Math.min(1, n)) }
    out[k] = n
  }
  return out
}

export const POST = withOrg(async (request) => {
  let body: { template?: string; missing?: string[]; text?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const template = body.template as Template
  const missing = Array.isArray(body.missing) ? body.missing.filter((k) => typeof k === 'string') : []
  const text = typeof body.text === 'string' ? body.text.slice(0, 1000) : ''
  if (!TEMPLATES.includes(template) || !text.trim()) {
    return Response.json({ error: 'template and text are required.' }, { status: 400 })
  }

  const allowed = allowedKeys(template, missing)
  const apiKey = process.env.ANTHROPIC_API_KEY

  // No model configured → deterministic extractor.
  if (!apiKey) return Response.json({ slots: extractSlots(template, missing, text) })

  try {
    const keyLines = [...allowed].map((k) => `- ${k}: ${KEY_UNITS[k] ?? 'number'}`).join('\n')
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system:
        'You extract financial decision parameters that the user EXPLICITLY stated in their message. ' +
        'Output ONLY a minified JSON object — no prose, no code fences. ' +
        'Include a key ONLY if the user clearly stated that value; never guess, infer, or invent a number. ' +
        'Convert words to numbers ("two grand" → 2000, "two-thirds" → 0.67, "fifteen a month" → 15). ' +
        `Allowed keys and units:\n${keyLines}`,
      messages: [{ role: 'user', content: text }],
    })
    const raw = msg.content.find((c) => c.type === 'text')?.text ?? '{}'
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) || '{}'
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const slots = sanitize(parsed, allowed)
    // If the model found nothing usable, try the deterministic reader too.
    return Response.json({ slots: Object.keys(slots).length ? slots : extractSlots(template, missing, text) })
  } catch (err) {
    console.error('navi extract failed, using deterministic fallback:', err)
    return Response.json({ slots: extractSlots(template, missing, text) })
  }
})
