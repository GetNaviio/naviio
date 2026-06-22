'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, X, Send, Bot, Sparkles, TrendingUp, DollarSign, PieChart, Calendar, RotateCcw, Mic, ArrowRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import AiDisclaimer from '@/components/AiDisclaimer'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { cleanNaviText } from '@/lib/naviFormat'
import { parseDecisionQuestion, extractSlots, missingParams } from '@/lib/decisions/parse'
import NaviDecisionDrawer from '@/components/navi/NaviDecisionDrawer'
import type { DecisionAnswer, DecisionTemplate } from '@/lib/decisions/types'

// Friendly phrasing for the inputs Navi gathers when a decision needs more detail.
const SLOT_ASK: Record<string, string> = {
  price: 'the price',
  avgRevenuePerUnit: 'your average revenue per unit (per client / job / treatment)',
  grossMarginPct: 'your gross margin %',
  unitsPerMonth: 'how many you expect to do per month',
  amount: 'the amount (and whether it’s one-time or monthly)',
}
function askFor(missing: string[]): string {
  const parts = missing.map((k) => SLOT_ASK[k] ?? k)
  const list = parts.length <= 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  return `To run that, tell me ${list}.`
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** When Navi answers a decision question, the grounded result opens as a drill-down. */
  decision?: DecisionAnswer
  question?: string
  decisionId?: string
  decisionParams?: Record<string, unknown>
  /** A side-effecting action Navi proposed — runs only on the user's confirm. */
  proposedAction?: { tool: string; summary: string; input: Record<string, unknown> }
  actionState?: 'pending' | 'running' | 'done' | 'declined'
  actionResult?: string
}

const verdictDot = (v: DecisionAnswer['verdict']) =>
  v === 'yes' ? <CheckCircle2 size={15} style={{ color: '#10B981' }} />
  : v === 'no' ? <XCircle size={15} style={{ color: '#EF4444' }} />
  : <AlertCircle size={15} style={{ color: '#3B82F6' }} />

const SUGGESTED = [
  { icon: DollarSign,  prompt: 'What are my top tax saving opportunities right now?' },
  { icon: TrendingUp,  prompt: 'Analyze my revenue growth and unit economics.' },
  { icon: Calendar,    prompt: 'My Q2 estimated tax is due June 16 — am I on track?' },
  { icon: PieChart,    prompt: 'Should I stay S-Corp or consider switching to C-Corp?' },
]

// Greeting personalized to the signed-in user. Generic ("Hi —") until their
// name loads, so it never hardcodes a wrong name.
function welcomeMessage(firstName?: string): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: `Hi${firstName ? ` ${firstName}` : ''} — I'm Navi, your financial co-pilot. Ask me anything about your P&L, taxes, cash flow, or business performance.`,
  }
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: '#00C49F',
            animation: `cb-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes cb-bounce {
          0%,60%,100%{transform:translateY(0);opacity:.4}
          30%{transform:translateY(-5px);opacity:1}
        }
      `}</style>
    </span>
  )
}

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([welcomeMessage()])
  const [firstName, setFirstName] = useState('')

  // Personalize the greeting once we know who's signed in.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name: string | null = d?.user?.name || d?.user?.email || null
        if (!name) return
        const fn = name.split(/[\s@]/)[0]
        setFirstName(fn)
        setMessages((prev) => prev.map((m) => (m.id === 'welcome' ? welcomeMessage(fn) : m)))
      })
      .catch(() => {})
  }, [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [outOfCredits, setOutOfCredits] = useState(false)
  const [decisionView, setDecisionView] = useState<{ answer: DecisionAnswer; question: string; decisionId?: string; params?: Record<string, unknown> } | null>(null)
  // When a decision needs more inputs, Navi collects them across turns.
  const [pending, setPending] = useState<{ template: DecisionTemplate; params: Record<string, unknown>; question: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // The mobile bottom bar's center button opens Navi via this event.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('naviio:open-navi', onOpen)
    return () => window.removeEventListener('naviio:open-navi', onOpen)
  }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    const asstId = crypto.randomUUID()
    setMessages((p) => [...p, userMsg, { id: asstId, role: 'assistant', content: '', streaming: true }])
    setInput('')
    setLoading(true)
    setOutOfCredits(false)

    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    const clean = text.trim()

    // Run a fully-specified decision through the engine; render the drill-down.
    const runDecision = async (body: Record<string, unknown>, q: string): Promise<'ok' | 'credits' | 'none' | 'abort'> => {
      try {
        const dRes = await fetch('/api/navi/decision', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
        })
        if (dRes.status === 402) {
          setOutOfCredits(true)
          setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: "You're out of credits — reload to keep asking Navi.", streaming: false } : m))
          return 'credits'
        }
        const dData = await dRes.json().catch(() => ({}))
        if (dData?.answer) {
          const ans = dData.answer as DecisionAnswer
          const did = typeof dData.decisionId === 'string' ? dData.decisionId : undefined
          const dParams = (dData.params as Record<string, unknown>) ?? {}
          setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: ans.headline, decision: ans, question: q, decisionId: did, decisionParams: dParams, streaming: false } : m))
          setDecisionView({ answer: ans, question: q, decisionId: did, params: dParams })
          return 'ok'
        }
        return 'none'
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return 'abort'
        return 'none'
      }
    }
    const sayAssistant = (content: string) =>
      setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content, streaming: false } : m))

    // 1) Mid-collection: Navi is gathering inputs for a decision — read this reply.
    if (pending) {
      const stillMissing = missingParams(pending.template, pending.params)
      let filled = extractSlots(pending.template, stillMissing, clean)
      // LLM fallback for free-form replies the regex reader can't parse.
      if (Object.keys(filled).length === 0) {
        try {
          const exRes = await fetch('/api/navi/extract', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: pending.template, missing: stillMissing, text: clean }), signal,
          })
          if (exRes.ok) {
            const ex = await exRes.json().catch(() => ({}))
            if (ex?.slots && Object.keys(ex.slots).length > 0) filled = ex.slots as Record<string, number>
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') { setLoading(false); return }
        }
      }
      if (Object.keys(filled).length > 0) {
        const merged = { ...pending.params, ...filled }
        const left = missingParams(pending.template, merged)
        if (left.length === 0) {
          const r = await runDecision({ template: pending.template, params: merged }, pending.question)
          if (r === 'abort') { setLoading(false); return }
          setPending(null)
          if (r === 'ok' || r === 'credits') { setLoading(false); return }
          // 'none' → fall through to a normal chat reply
        } else {
          setPending({ ...pending, params: merged })
          sayAssistant(`Got it. ${askFor(left)}`)
          setLoading(false); return
        }
      } else {
        setPending(null)  // no usable values → user moved on; drop the ask
      }
    }

    // 2) A new decision question. Computable → drill-down; missing inputs → ask for them.
    const parsed = parseDecisionQuestion(clean)
    if (parsed.isDecision && parsed.missing.length === 0) {
      const r = await runDecision({ question: clean }, clean)
      if (r === 'abort') { setLoading(false); return }
      if (r === 'ok' || r === 'credits') { setLoading(false); return }
      // 'none' → fall through to chat
    } else if (parsed.isDecision && parsed.missing.length > 0) {
      setPending({ template: parsed.template, params: parsed.params as Record<string, unknown>, question: clean })
      sayAssistant(`Happy to run that. ${askFor(parsed.missing)}`)
      setLoading(false); return
    }

    const history = [
      ...messages.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text.trim() },
    ]

    try {
      const res = await fetch('/api/navi/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        // Surface the server's actual reason (e.g. snapshot/model errors).
        let reason = `Navi couldn't respond (HTTP ${res.status}).`
        try { const j = await res.json(); if (j?.error) reason = `Navi: ${j.error}` } catch { /* non-JSON */ }
        if (res.status === 402) setOutOfCredits(true) // show a reload prompt in the chat
        setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: reason, streaming: false } : m))
        return
      }
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      let streamErr = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6).trim()
          if (d === '[DONE]') break
          try {
            const p = JSON.parse(d)
            if (p.text) {
              acc += p.text
              const display = cleanNaviText(acc)
              setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: display } : m))
            } else if (p.tool && !acc) {
              // Live activity while the agent runs a tool (only until the answer starts).
              setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: `${p.tool}…` } : m))
            } else if (p.proposedAction) {
              setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, proposedAction: p.proposedAction, actionState: 'pending' } : m))
            } else if (p.error) {
              streamErr = p.error
            }
          } catch { /* skip */ }
        }
      }
      const finalContent = acc ? cleanNaviText(acc) : (streamErr ? `Navi hit an error: ${streamErr}` : 'Navi returned an empty reply.')
      setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, content: finalContent, streaming: false } : m))
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages((prev) => prev.map((m) => m.id === asstId
        ? { ...m, content: 'Something went wrong — please try again.', streaming: false }
        : m))
    } finally {
      setLoading(false)
    }
  }, [messages, loading, pending])

  // Run a side-effecting action Navi proposed — only on the user's explicit confirm.
  async function confirmAction(msgId: string, action: { tool: string; input: Record<string, unknown> }) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionState: 'running', actionResult: undefined } : m))
    try {
      const r = await fetch('/api/navi/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: action.tool, input: action.input }),
      })
      const d = await r.json().catch(() => ({}))
      const ok = r.ok && d?.ok
      // Some actions return a document URL to open (e.g. the board pack) rather
      // than mutating data.
      const url = typeof d?.result?.url === 'string' ? d.result.url : null
      if (ok && url) window.open(url, '_blank', 'noopener')
      setMessages((prev) => prev.map((m) => m.id === msgId
        ? { ...m, actionState: ok ? 'done' : 'pending', actionResult: ok ? (url ? 'Opened in a new tab — use Print → Save as PDF.' : 'Done.') : (d?.error || 'Could not complete that action.') }
        : m))
      if (ok && !url) window.dispatchEvent(new CustomEvent('naviio:refresh')) // refresh dashboards after a data change
    } catch {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionState: 'pending', actionResult: 'Network error — try again.' } : m))
    }
  }
  function declineAction(msgId: string) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionState: 'declined' } : m))
  }

  // Voice input — speak to Navi; the final transcript is sent automatically.
  const voice = useVoiceInput((text) => send(text))

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const reset = () => {
    abortRef.current?.abort()
    setMessages([welcomeMessage(firstName)])
    setLoading(false)
    setPending(null)
  }

  const buyCredits = async () => {
    try {
      const r = await fetch('/api/credits/checkout', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.url) window.location.href = d.url
    } catch { /* ignore */ }
  }

  const showSuggestions = messages.length === 1

  return (
    <>
      {/* Chat panel */}
      <div
        className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 origin-bottom-right"
        style={{
          width: 380,
          height: open ? 540 : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          backgroundColor: 'var(--color-surface-input)',
          border: '1px solid var(--color-surface-border)',
          transform: open ? 'scale(1)' : 'scale(0.92)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-surface-card)', borderBottom: '1px solid var(--color-surface-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0,196,159,0.15)' }}>
              <Sparkles size={13} style={{ color: '#00C49F' }} />
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">Navi</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Your financial co-pilot</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }} aria-label="Start new chat">
              <RotateCcw size={13} />
            </button>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-muted)' }} aria-label="Close chat">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            // A decision answer shows a compact result that opens the full
            // drill-down (framed like the transactions drill-down).
            if (msg.decision) {
              const d = msg.decision
              return (
                <div key={msg.id} className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                    <Bot size={12} style={{ color: '#00C49F' }} />
                  </div>
                  <button
                    onClick={() => setDecisionView({ answer: d, question: msg.question ?? '', decisionId: msg.decisionId, params: msg.decisionParams })}
                    className="text-left px-3.5 py-2.5 rounded-2xl max-w-[85%] transition-colors hover:bg-white/5"
                    style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderBottomLeftRadius: 4 }}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {verdictDot(d.verdict)} {d.headline}
                    </span>
                    <span className="flex items-center gap-1 text-xs mt-1.5 font-medium" style={{ color: '#3B82F6' }}>
                      View full analysis <ArrowRight size={12} />
                    </span>
                  </button>
                </div>
              )
            }
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'items-end gap-2'}`}>
                {!isUser && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                    <Bot size={12} style={{ color: '#00C49F' }} />
                  </div>
                )}
                <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                  <div
                    className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                    style={{
                      whiteSpace: 'pre-wrap',
                      ...(isUser
                        ? { backgroundColor: '#3B82F6', color: '#fff', borderBottomRightRadius: 4 }
                        : { backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)', borderBottomLeftRadius: 4 }),
                    }}
                  >
                    {msg.streaming && msg.content === '' ? <TypingDots /> : (
                      <>
                        {msg.content}
                        {msg.streaming && (
                          <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle rounded-full" style={{ backgroundColor: '#00C49F', animation: 'cb-blink 1s step-end infinite' }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Proposed action — Navi never runs side effects without this confirm. */}
                  {!isUser && msg.proposedAction && msg.actionState && (
                    <div className="rounded-xl px-3 py-2.5 text-xs w-full" style={{ backgroundColor: 'var(--color-surface-card-hover)', border: '1px dashed #3B82F6' }}>
                      <p className="font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>{msg.proposedAction.summary}</p>
                      {msg.actionState === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => confirmAction(msg.id, msg.proposedAction!)} className="px-2.5 py-1 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg,#2F6BFF,#1E5BE6)' }}>Confirm</button>
                          <button onClick={() => declineAction(msg.id)} className="px-2.5 py-1 rounded-lg" style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>Not now</button>
                        </div>
                      )}
                      {msg.actionState === 'running' && <p style={{ color: 'var(--color-text-muted)' }}>Working…</p>}
                      {msg.actionState === 'done' && <p style={{ color: '#10B981' }}>✓ {msg.actionResult ?? 'Done.'}</p>}
                      {msg.actionState === 'declined' && <p style={{ color: 'var(--color-text-muted)' }}>Dismissed.</p>}
                      {msg.actionState === 'pending' && msg.actionResult && <p className="mt-1.5" style={{ color: '#F87171' }}>{msg.actionResult}</p>}
                    </div>
                  )}
                </div>
                {isUser && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mb-0.5" style={{ background: 'linear-gradient(135deg, #3B82F6, #14B8A6)', color: '#fff' }}>
                    E
                  </div>
                )}
              </div>
            )
          })}

          {showSuggestions && (
            <div className="space-y-1.5 pt-1">
              {SUGGESTED.map(({ icon: Icon, prompt }) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all"
                  style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                >
                  <Icon size={11} style={{ color: '#00C49F', flexShrink: 0 }} />
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Out-of-credits reload prompt — only when a message hit 0 credits */}
        {outOfCredits && (
          <div className="flex-shrink-0 px-3 pb-1 pt-1">
            <button
              onClick={buyCredits}
              className="w-full text-xs px-3 py-2 rounded-lg font-semibold transition-colors animate-pulse"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.5)' }}
            >
              Out of credits — Reload $10 for 100 credits
            </button>
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <div className="flex items-end gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your financials..."
              rows={1}
              className="flex-1 bg-transparent text-sm resize-none outline-none leading-relaxed"
              style={{ color: 'var(--color-text-primary)', maxHeight: 80 }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 80)}px`
              }}
            />
            {voice.supported && (
              <button
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                disabled={loading}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5"
                style={{ backgroundColor: voice.listening ? 'rgba(239,68,68,0.15)' : 'var(--color-surface-border)' }}
                aria-label={voice.listening ? 'Stop listening' : 'Speak to Navi'}
                title={voice.listening ? 'Listening… click to stop' : 'Speak to Navi'}
              >
                <Mic size={13} style={{ color: voice.listening ? '#EF4444' : 'var(--color-text-muted)', animation: voice.listening ? 'cb-pulse 1s ease-in-out infinite' : 'none' }} />
              </button>
            )}
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5"
              style={{ backgroundColor: input.trim() && !loading ? '#00C49F' : 'var(--color-surface-border)' }}
            >
              <Send size={12} className="text-white" style={{ marginLeft: 1 }} />
            </button>
          </div>
          {voice.error && (
            <div className="text-xs mt-1.5 px-1 leading-relaxed" style={{ color: '#F59E0B' }}>
              {voice.error === 'not-allowed' || voice.error === 'service-not-allowed' ? (
                <>
                  <span className="font-semibold">Microphone access is blocked.</span> To enable voice:
                  <span className="block mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    1. Click the mic / lock icon in your browser’s address bar → allow the microphone for this site.<br />
                    2. On Mac, also check <span className="font-medium">System Settings → Privacy &amp; Security → Microphone</span> and turn your browser <span className="font-medium">on</span>.<br />
                    3. Reload the page and try again.
                  </span>
                </>
              ) : voice.error === 'insecure' ? (
                <>
                  <span className="font-semibold">Voice needs a secure page.</span>
                  <span className="block mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Open the app at <span className="font-medium">http://localhost:3000</span> (not a 192.168.x.x address). The microphone only works on localhost or HTTPS.
                  </span>
                </>
              ) : voice.error === 'in-use'
                ? 'Your microphone is being used by another app (Zoom, FaceTime, etc.). Close it and try again.'
                : voice.error === 'audio-capture'
                  ? 'No working microphone found — check that the right input device is connected and selected in your system sound settings.'
                  : voice.error === 'no-speech'
                    ? 'Didn’t catch that — tap the mic and speak.'
                    : `Voice input had a problem (${voice.error}) — please try again.`}
              {voice.detail && (
                <span className="block mt-1 font-mono break-all" style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>
                  diag: {voice.detail}
                </span>
              )}
            </div>
          )}
          <AiDisclaimer className="mt-2 px-1" />
        </div>
      </div>

      {/* FAB toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Navi' : 'Open Navi'}
        className={`${open ? 'flex' : 'hidden lg:flex'} fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full items-center justify-center shadow-lg transition-all duration-200`}
        style={{
          background: open ? 'var(--color-surface-card)' : 'linear-gradient(135deg, #00B894, #00C49F)',
          border: open ? '1px solid #1E3055' : 'none',
          transform: open ? 'rotate(0deg)' : 'rotate(0deg)',
        }}
      >
        <style>{`@keyframes cb-blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes cb-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.15)}}`}</style>
        {open
          ? <X size={20} style={{ color: 'var(--color-text-muted)' }} />
          : <MessageSquare size={20} className="text-white" />
        }
      </button>

      {/* Decision drill-down (slide-over, framed like the transactions drill-down) */}
      {decisionView && (
        <NaviDecisionDrawer
          answer={decisionView.answer}
          question={decisionView.question}
          decisionId={decisionView.decisionId}
          params={decisionView.params}
          onClose={() => setDecisionView(null)}
          onRecompute={(answer, decisionId, params) => {
            // Keep the open drawer + the originating chat bubble in sync after a recompute.
            setDecisionView((prev) => (prev ? { ...prev, answer, decisionId, params } : prev))
            setMessages((prev) => prev.map((m) =>
              m.decision === decisionView.answer
                ? { ...m, content: answer.headline, decision: answer, decisionId, decisionParams: params }
                : m))
          }}
        />
      )}
    </>
  )
}
