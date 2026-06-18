/**
 * Navi agent loop — a bounded tool-use cycle over the org's live data.
 *
 * READ tools run inside the loop (figures always come from tool results, never
 * the model). ACTION tools (side effects) are NEVER executed here: when the model
 * calls one, the loop emits a proposed action for the user to confirm and stops.
 * Optional web search (NAVI_WEB_SEARCH=1) uses Anthropic's server-side tool.
 */
import Anthropic from '@anthropic-ai/sdk'
import { NAVI_TOOLS, toolByName } from './tools'

const MODEL = 'claude-sonnet-4-6'
type AnyTool = NonNullable<Anthropic.MessageCreateParams['tools']>[number]

export interface ProposedAction { tool: string; summary: string; input: Record<string, unknown> }

export interface AgentCallbacks {
  onTool: (label: string, name: string) => void
  onText: (text: string) => void
  /** A side-effecting action the user must confirm before it runs. */
  onProposedAction: (action: ProposedAction) => void
}

function buildTools(): AnyTool[] {
  const tools: AnyTool[] = NAVI_TOOLS.map((t) => (
    { name: t.name, description: t.description, input_schema: t.input_schema } as AnyTool
  ))
  if (process.env.NAVI_WEB_SEARCH === '1') {
    tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as AnyTool)
  }
  return tools
}

export async function runNaviAgent(opts: {
  orgId: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  cb: AgentCallbacks
  maxSteps?: number
}): Promise<{ text: string; usedTools: string[]; proposed: boolean }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxSteps = opts.maxSteps ?? 6
  const tools = buildTools()

  const convo: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }))
  const usedTools: string[] = []
  let finalText = ''

  for (let step = 0; step < maxSteps; step++) {
    const resp = await client.messages.create({ model: MODEL, max_tokens: 1500, system: opts.system, tools, messages: convo })

    // Server-side tool (web search) needs another round trip — continue.
    if (resp.stop_reason === 'pause_turn') {
      convo.push({ role: 'assistant', content: resp.content })
      continue
    }

    finalText = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const actionUses = toolUses.filter((b) => toolByName(b.name)?.kind === 'action')

    // An action was requested → propose it for confirmation; do NOT execute.
    if (actionUses.length > 0) {
      if (finalText) opts.cb.onText(finalText)
      for (const b of actionUses) {
        const tool = toolByName(b.name)!
        const input = (b.input ?? {}) as Record<string, unknown>
        opts.cb.onProposedAction({ tool: b.name, summary: tool.summarize?.(input) ?? tool.label, input })
      }
      return { text: finalText, usedTools, proposed: true }
    }

    if (resp.stop_reason !== 'tool_use') {
      if (finalText) opts.cb.onText(finalText)
      return { text: finalText, usedTools, proposed: false }
    }

    // Run the read tools and feed results back.
    convo.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const b of toolUses) {
      const tool = toolByName(b.name)
      if (tool) { opts.cb.onTool(tool.label, tool.name); usedTools.push(tool.name) }
      let out: unknown
      try {
        out = tool ? await tool.run(opts.orgId, (b.input ?? {}) as Record<string, unknown>) : { error: `unknown tool: ${b.name}` }
      } catch (e) {
        out = { error: e instanceof Error ? e.message : 'tool failed' }
      }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) })
    }
    convo.push({ role: 'user', content: results })
  }

  finalText = finalText || 'I pulled the data but want to keep this focused — could you narrow the question a little?'
  opts.cb.onText(finalText)
  return { text: finalText, usedTools, proposed: false }
}
