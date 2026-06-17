/**
 * LLM slot extraction — the fallback when the deterministic regex extractor
 * can't read a free-form reply (e.g. "we charge two grand a session and keep
 * about two-thirds"). The model ONLY extracts values the user actually stated;
 * it never invents numbers, and the decision math is still done by the engine.
 *
 * Provider order (cheapest capable first), each degrading to the next:
 *   1. Together AI (if TOGETHER_API_KEY) — cheap open model, OpenAI-compatible.
 *   2. Anthropic   (if ANTHROPIC_API_KEY).
 *   3. Deterministic regex extractor (always available).
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

const TOGETHER_MODEL = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

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

/** Together AI — OpenAI-compatible chat completions via fetch (no SDK needed). */
async function callTogether(system: string, text: string): Promise<string | null> {
  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        max_tokens: 200,
        temperature: 0,
        messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function callAnthropic(system: string, text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: text }],
    })
    return msg.content.find((c) => c.type === 'text')?.text ?? null
  } catch {
    return null
  }
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
  const system = systemPrompt(allowed)

  // 1) Together (cheap), then 2) Anthropic, then 3) deterministic regex.
  let slots: Record<string, number> = {}
  const togetherRaw = await callTogether(system, text)
  if (togetherRaw) slots = parseSlots(togetherRaw, allowed)

  if (Object.keys(slots).length === 0) {
    const anthropicRaw = await callAnthropic(system, text)
    if (anthropicRaw) slots = parseSlots(anthropicRaw, allowed)
  }

  if (Object.keys(slots).length === 0) slots = extractSlots(template, missing, text)

  return Response.json({ slots })
})
