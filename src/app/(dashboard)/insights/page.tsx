'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send,
  Bot,
  Sparkles,
  TrendingUp,
  DollarSign,
  PieChart,
  Calendar,
  RefreshCw,
} from 'lucide-react'
import AiDisclaimer from '@/components/AiDisclaimer'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const SUGGESTED_PROMPTS = [
  { icon: DollarSign, label: 'Tax savings summary', prompt: 'What are my top 3 tax saving opportunities right now and how much can I save?' },
  { icon: TrendingUp, label: 'Revenue analysis', prompt: 'Analyze my revenue growth and what\'s driving it. Are my unit economics healthy?' },
  { icon: Calendar, label: 'Q2 tax payment', prompt: 'My Q2 estimated tax payment is due June 16. How much do I owe and is my cash position strong enough?' },
  { icon: PieChart, label: 'Entity structure', prompt: 'Should I stay as an S-Corp or consider switching to a C-Corp given my current revenue?' },
]

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: '#3B82F6',
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function MessageBubble({ message, userInitial = 'U' }: { message: Message; userInitial?: string }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-end gap-2 max-w-[75%]">
          <div
            className="px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-white"
            style={{ backgroundColor: '#3B82F6' }}
          >
            {message.content}
          </div>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mb-0.5"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #14B8A6)' }}
          >
            {userInitial}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 max-w-[80%]">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
        style={{ backgroundColor: 'var(--color-surface-border)' }}
      >
        <Bot size={14} style={{ color: '#3B82F6' }} />
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm text-sm leading-relaxed"
        style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
      >
        {message.streaming && message.content === '' ? (
          <TypingIndicator />
        ) : (
          <span>
            {message.content}
            {message.streaming && (
              <span
                className="inline-block w-0.5 h-4 ml-0.5 align-middle"
                style={{
                  backgroundColor: '#3B82F6',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            )}
          </span>
        )}
        <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      </div>
    </div>
  )
}

// Greeting personalized to the signed-in user. Generic ("Hi —") until their
// name loads, so it never hardcodes a wrong name.
function welcomeMessage(firstName?: string): string {
  return `Hi${firstName ? ` ${firstName}` : ''} — I have full visibility into your financials. Ask me anything about your P&L, tax strategy, cash flow, or business performance. I can also run scenarios and flag optimization opportunities.`
}

export default function InsightsPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage() },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const firstName = userName ? userName.split(/[\s@]/)[0] : ''
  const userInitial = (userName || 'U').charAt(0).toUpperCase()

  // Personalize the greeting + user avatar once we know who's signed in.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name: string | null = d?.user?.name || d?.user?.email || null
        if (!name) return
        setUserName(name)
        const fn = name.split(/[\s@]/)[0]
        setMessages((prev) =>
          prev.map((m) => (m.id === 'welcome' ? { ...m, content: welcomeMessage(fn) } : m)),
        )
      })
      .catch(() => {})
  }, [])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    const assistantId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setIsLoading(true)

    const history = messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text.trim() })

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/insights/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = dec.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              accumulated += parsed.text
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                )
              )
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([
      { id: 'welcome', role: 'assistant', content: welcomeMessage(firstName) },
    ])
    setIsLoading(false)
  }

  const showSuggestions = messages.length <= 1

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#060D1F' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-card)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}
          >
            <Sparkles size={18} style={{ color: '#3B82F6' }} />
          </div>
          <div>
            <h1 className="text-white font-semibold text-base">Navi</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Ask anything about your financials
            </p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-surface-border)' }}
        >
          <RefreshCw size={12} />
          New chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} userInitial={userInitial} />
        ))}

        {/* Suggested prompts (shown after welcome only) */}
        {showSuggestions && (
          <div className="pt-2">
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Suggested questions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(prompt)}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left text-sm transition-all group"
                  style={{
                    backgroundColor: 'var(--color-surface-card)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}
                  >
                    <Icon size={13} style={{ color: '#3B82F6' }} />
                  </div>
                  <span className="font-medium text-xs leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-6 pb-6 pt-3 border-t"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div
          className="flex items-end gap-3 rounded-2xl px-4 py-3"
          style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your financials, tax strategy, cash flow..."
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none leading-relaxed"
            style={{
              color: 'var(--color-text-primary)',
              maxHeight: '120px',
              minHeight: '24px',
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all mb-0.5"
            style={{
              backgroundColor: input.trim() && !isLoading ? '#3B82F6' : 'var(--color-surface-border)',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            }}
          >
            <Send size={14} className="text-white" style={{ marginLeft: '1px' }} />
          </button>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Press Enter to send · Shift+Enter for new line
        </p>
        <AiDisclaimer className="justify-center mt-1.5" />
      </div>
    </div>
  )
}
