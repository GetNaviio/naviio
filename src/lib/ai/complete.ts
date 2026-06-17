/**
 * Shared LLM completion with provider fallback for Navi's non-streaming jobs
 * (slot extraction, commentary, etc.). Order: Together AI (cheap open model,
 * OpenAI-compatible) → Anthropic → none. Each job picks its own model size via
 * maxTokens and can prefer a provider or validate the output before accepting.
 *
 * This is for internal/structured generation. The primary streaming chat stays
 * on its own Anthropic path. Math/decisions are never produced here — that's the
 * deterministic engine.
 */
import Anthropic from '@anthropic-ai/sdk'

export type Provider = 'together' | 'anthropic'

const TOGETHER_MODEL = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const TIMEOUT_MS = 20000

export function hasLLM(): boolean {
  return !!(process.env.TOGETHER_API_KEY || process.env.ANTHROPIC_API_KEY)
}

async function callTogether(system: string | undefined, prompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ]
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TOGETHER_MODEL, max_tokens: maxTokens, temperature: 0.2, messages }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function callAnthropic(system: string | undefined, prompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    return text.trim() ? text : null
  } catch {
    return null
  }
}

export async function llmComplete(opts: {
  prompt: string
  system?: string
  maxTokens?: number
  /** Try this provider first; otherwise cheapest-available (Together) first. */
  prefer?: Provider
  /** Return the first result that passes; else try the next provider. */
  accept?: (text: string) => boolean
}): Promise<string | null> {
  const { prompt, system, maxTokens = 600, prefer, accept } = opts

  const available: Provider[] = []
  if (process.env.TOGETHER_API_KEY) available.push('together')
  if (process.env.ANTHROPIC_API_KEY) available.push('anthropic')

  const order = prefer
    ? [prefer, ...available.filter((p) => p !== prefer)]
    : available

  const tried = new Set<Provider>()
  for (const p of order) {
    if (tried.has(p) || !available.includes(p)) continue
    tried.add(p)
    const text = p === 'together' ? await callTogether(system, prompt, maxTokens) : await callAnthropic(system, prompt, maxTokens)
    if (text && (!accept || accept(text))) return text
  }
  return null
}
