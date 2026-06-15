'use client'

import Link from 'next/link'
import { Plug } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Honest empty state shown when a tab/metric has no connected data source.
 * Never shows demo numbers — points the user to the Integrations page instead.
 */
export default function ConnectPrompt({
  title,
  message,
  cta = 'Connect an integration',
  icon,
}: {
  title: string
  message: string
  cta?: string
  icon?: ReactNode
}) {
  return (
    <div
      className="rounded-xl p-10 flex flex-col items-center text-center gap-3"
      style={{ backgroundColor: 'var(--color-surface-card)', border: '1px dashed var(--color-surface-border)' }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-muted)' }}
      >
        {icon ?? <Plug size={20} />}
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm max-w-md" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
      <Link
        href="/integrations"
        className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        style={{ backgroundColor: '#3B82F6', color: 'white' }}
      >
        {cta}
      </Link>
    </div>
  )
}
