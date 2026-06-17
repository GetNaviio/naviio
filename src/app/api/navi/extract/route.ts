/**
 * LLM slot extraction — the fallback when the deterministic regex extractor
 * can't read a free-form reply (e.g. "we charge two grand a session and keep
 * about two-thirds"). The model ONLY extracts values the user actually stated;
 * it never invents numbers, and the decision math is still done by the engine.
 *
 * Uses the shared provider router (Together → Anthropic), then degrades to the
 * deterministic regex extractor when no model is configured or yields nothing.
 */
import { withOrg } from '@/lib/api/with-org'
import { extractSlots } from '@/lib/decisions/parse'
import { llmComplete } from '@/lib/ai/complete'

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

function systemPrompt(allowed: Set<string>): string {
  const keyLines = [...allowed].map((k) => `- ${k}: ${KEY_UNITS[k] ?? 'number'}`).join('\n')
  return (
    'You extract financial decision parameters that the user EXPLICITLY stated in their message. ' +
    'Output ONLY a minified JSON object — no prose, no code fences. ' +
    'Include a key ONLY if the user clearly stated that value; never guess, infer, or invent a number. ' +
    'Convert words to numbers ("two grand" → 2000, "two-thirds" → 0.67, "fifteen a month" → 15). ' +
    `Allowed keys and units:\n${keyLines}`
  )
}

/** Keep only allowed, finite numbers; normalize a percent given as 68 → 0.68. */
function parseSlots(raw: string, allowed: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  try {
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) || '{}'
    const obj = JSON.parse(jsonStr) as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (!allowed.has(k)) continue
      let n = typeof v === 'number' ? v : parseFloat(String(v))
      if (!Number.isFinite(n)) continue
      if (k === 'grossMarginPct') { if (n > 1) n = n / 100; n = Math.max(0, Math.min(1, n)) }
      out[k] = n
    }
  } catch { /* malformed JSON → empty */ }
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
  const raw = await llmComplete({
    system: systemPrompt(allowed),
    prompt: text,
    maxTokens: 200,
    // Only accept a provider's output if it actually yields a usable slot.
    accept: (t) => Object.keys(parseSlots(t, allowed)).length > 0,
  })

  let slots = raw ? parseSlots(raw, allowed) : {}
  if (Object.keys(slots).length === 0) slots = extractSlots(template, missing, text)

  return Response.json({ slots })
})
