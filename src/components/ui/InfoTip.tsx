import { HelpCircle } from 'lucide-react'

// Rendered entirely with <span> (phrasing content) so InfoTip is valid inside
// <p> tags — a <div> here auto-closes the paragraph and causes React hydration
// errors. display is controlled via classes, which is valid HTML regardless.
export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex flex-shrink-0 align-middle">
      <HelpCircle size={12} className="cursor-help" style={{ color: '#475569' }} />
      <span
        className="pointer-events-none absolute top-full left-1/2 z-50 block w-52 -translate-x-1/2 mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{
          backgroundColor: 'var(--color-surface-input)',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text-secondary)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}
      >
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 block w-0 h-0"
          style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '5px solid var(--color-surface-border)',
          }}
        />
        {text}
      </span>
    </span>
  )
}
