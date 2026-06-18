/**
 * Navi agent loop — a bounded tool-use cycle over the org's live data.
 *
 * The model may call the read tools (see ./tools) as many times as it needs
 * within a step budget, then produces a final plain-text answer. Figures always
 * come from tool results, never the model. Side-effecting tools are NOT executed
 * here (none are registered yet); when added they surface as a proposed action
 * for the user to confirm (see docs/decisions/0051).
 */
import Anthropic from '@anthropic-ai/sdk'
import { READ_TOOLS, toolByName } from './tools'

const MODEL = 'claude-sonnet-4-6'

export interface AgentCallbacks {
  /** Fired when the agent starts running a tool (for live UI activity). */
  onTool: (label: string, name: string) => void
  /** Fired once with the final plain-text answer. */
  onText: (text: string) => void
}

export async function runNaviAgent(opts: {
  orgId: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  cb: AgentCallbacks
  maxSteps?: number
}): Promise<{ text: string; usedTools: string[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxSteps = opts.maxSteps ?? 6
  const tools = READ_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))

  const convo: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }))
  const usedTools: string[] = []
  let finalText = ''

  for (let step = 0; step < maxSteps; step++) {
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 1500, system: opts.system, tools, messages: convo,
    })
    finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    if (resp.stop_reason !== 'tool_use') {
      if (finalText) opts.cb.onText(finalText)
      return { text: finalText, usedTools }
    }

    // Record the assistant's tool-use turn, run each (read) tool, feed results back.
    convo.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue
      const tool = toolByName(block.name)
      if (tool) { opts.cb.onTool(tool.label, tool.name); usedTools.push(tool.name) }
      let out: unknown
      try {
        out = tool
          ? await tool.run(opts.orgId, (block.input ?? {}) as Record<string, unknown>)
          : { error: `unknown tool: ${block.name}` }
      } catch (e) {
        out = { error: e instanceof Error ? e.message : 'tool failed' }
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) })
    }
    convo.push({ role: 'user', content: results })
  }

  // Step budget exhausted — answer with what we have, or ask to narrow.
  finalText = finalText || 'I pulled the data but want to keep this focused — could you narrow the question a little?'
  opts.cb.onText(finalText)
  return { text: finalText, usedTools }
}
