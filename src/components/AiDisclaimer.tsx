/**
 * AI governance disclaimer. Shown anywhere Navi surfaces AI-generated output
 * (chat, decision cards) so users understand it's informational, not advice.
 * Keep the wording consistent — it's a liability boundary, not just UI copy.
 */
import { Info } from 'lucide-react'

export const AI_DISCLAIMER_TEXT =
  'AI-generated insights are informational and should be reviewed by a qualified financial professional.'

export default function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-1.5 text-[11px] leading-snug ${className}`}
      style={{ color: 'var(--color-text-muted)' }}
    >
      <Info size={12} className="mt-0.5 flex-shrink-0" />
      <span>{AI_DISCLAIMER_TEXT}</span>
    </p>
  )
}
