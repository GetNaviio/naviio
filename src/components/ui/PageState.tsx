'use client'

/**
 * Shared page-state components: loading skeleton grid, error with retry, and
 * empty state. One source of truth for the states every dashboard page needs,
 * with the accessibility wiring pages were missing:
 *
 * - Loading: role="status" + aria-busy + visually-hidden text, so screen
 *   readers announce "Loading" instead of silence; bones are aria-hidden.
 * - Error: role="alert" (announced immediately), keyboard-focusable retry.
 * - Empty: plain prose with an optional action — distinct from error, because
 *   "you have no data yet" and "we broke" must never look the same.
 *
 * Visual language matches the existing theme (CSS variables, same pulse
 * skeleton the pages already rendered inline).
 */
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

/** The exact skeleton grid pages previously inlined, with a11y added. */
export function SkeletonGrid({ count = 4, cardHeight = 'h-28' }: { count?: number; cardHeight?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`rounded-xl ${cardHeight} animate-pulse`}
          style={{ backgroundColor: 'var(--color-surface-card)' }}
        />
      ))}
    </div>
  )
}

export function ErrorState({
  message = "We couldn't load this page's data.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-xl p-6 flex flex-col items-center gap-3 text-center"
      style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
    >
      <AlertTriangle size={20} aria-hidden="true" style={{ color: '#F59E0B' }} />
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {message}{' '}It&apos;s not you — your data is safe. Please try again.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium rounded-lg px-4 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--color-surface-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-surface-border)' }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title?: string
  message: string
  action?: ReactNode
}) {
  return (
    <div
      className="rounded-xl p-6 text-center space-y-2"
      style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}
    >
      {title && (
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
      )}
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {message}
      </p>
      {action}
    </div>
  )
}
