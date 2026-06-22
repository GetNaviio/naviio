'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import type { PlaidLinkOnSuccess, PlaidLinkOnExit, PlaidLinkOnEvent } from 'react-plaid-link'

// Persisted so the OAuth return page (/integrations/oauth) can resume Link with
// the same token after an OAuth bank redirects the browser back to us.
export const PLAID_LINK_TOKEN_KEY = 'plaid_link_token'

interface PlaidLinkButtonProps {
  onSuccess: () => void
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  /** Update mode (re-auth or add accounts): reuse the existing item, no token
   *  exchange — refresh flags + resync on success instead. */
  updateMode?: boolean
  /** Request an account-selection update-mode token (add new accounts). */
  accountSelection?: boolean
}

export default function PlaidLinkButton({
  onSuccess,
  children,
  className,
  style,
  disabled,
  updateMode,
  accountSelection,
}: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // True when the backend refused because MFA isn't enabled (ATT-1). Drives a
  // helpful "enable two-factor" prompt with a link to Settings instead of a raw
  // error string.
  const [mfaRequired, setMfaRequired] = useState(false)
  // The mode the SERVER actually issued. The backend downgrades update→create
  // when the existing token can't be read, so we must exchange (not refresh) on
  // success. Defaults to the requested prop until the token response arrives.
  const effectiveUpdateRef = useRef<boolean>(!!updateMode)

  // ── Step 1 & 2: fetch link token from our backend ────────────────────────
  async function getLinkToken() {
    setLoading(true)
    setError(null)
    setMfaRequired(false)
    try {
      const res = await fetch('/api/auth/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountSelection: accountSelection === true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // MFA gate: surface a clear call to action rather than a generic error.
        if (res.status === 403 && data.error === 'MFA_REQUIRED') {
          setMfaRequired(true)
          setLoading(false)
          return
        }
        throw new Error(data.detail || data.error || 'Failed to create link token')
      }
      // Honor the mode the server actually issued (it may have downgraded
      // update→create when the old token was unreadable).
      effectiveUpdateRef.current = data.mode ? data.mode === 'update' : !!updateMode
      // Persist before opening so an OAuth redirect can resume with this token.
      localStorage.setItem(PLAID_LINK_TOKEN_KEY, data.link_token)
      setLinkToken(data.link_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link token')
      setLoading(false)
    }
  }

  // ── Step 4 & 5 & 6: user connected → exchange public token ───────────────
  const handleSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    setLoading(true)
    try {
      if (effectiveUpdateRef.current) {
        // Update mode keeps the existing access token — no exchange. Just clear
        // the reconnect / new-accounts flags and resync.
        const res = await fetch('/api/auth/plaid/refresh', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to refresh connection')
      } else {
        const res = await fetch('/api/auth/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken, metadata }),
        })
        if (!res.ok) throw new Error('Failed to exchange token')
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete connection')
    } finally {
      setLoading(false)
      setLinkToken(null)
      localStorage.removeItem(PLAID_LINK_TOKEN_KEY)
    }
  }, [onSuccess, updateMode])

  // Full reset to a retryable state. Called from BOTH onExit and the EXIT
  // event (belt and braces): if either callback is dropped — e.g. the modal is
  // closed mid-initialization — the other still unsticks the button.
  const resetFlow = useCallback(() => {
    setLinkToken(null)
    setLoading(false)
    // Drop the persisted token so a cancelled flow can't be resumed with a stale
    // (consumed) token — the next attempt fetches a fresh one.
    localStorage.removeItem(PLAID_LINK_TOKEN_KEY)
  }, [])

  const handleExit = useCallback<PlaidLinkOnExit>(() => resetFlow(), [resetFlow])

  // Link conversion logging — post each Plaid Link event to our funnel endpoint
  // (in addition to Plaid's built-in Link Analytics). Fire-and-forget with
  // keepalive so an in-progress event still sends if the modal closes; never
  // allowed to block or break the Link flow.
  const handleEvent = useCallback<PlaidLinkOnEvent>((eventName, metadata) => {
    // Backup reset: Plaid also reports exit through the event stream. If onExit
    // was dropped, this still returns the button to a clickable state.
    if (eventName === 'EXIT') resetFlow()
    try {
      fetch('/api/analytics/link-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventName, metadata }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* analytics must never break Link */
    }
  }, [resetFlow])

  // ── Step 3: open Plaid Link modal once we have a token ───────────────────
  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: handleSuccess,
    onExit: handleExit,
    onEvent: handleEvent,
  })

  // Auto-open exactly once when a token arrives and Link is ready. Doing this in
  // an effect (not in render) avoids re-embedding Plaid's script every render;
  // the ref guards against StrictMode's double-invoke in dev.
  const openedRef = useRef(false)
  useEffect(() => {
    if (linkToken && ready && !openedRef.current) {
      openedRef.current = true
      open()
    }
    if (!linkToken) openedRef.current = false
  }, [linkToken, ready, open])

  function handleClick() {
    if (linkToken && ready) {
      open()
    } else {
      getLinkToken()
    }
  }

  return (
    // Messages stack ABOVE the button so the CTA never resizes or wraps when a
    // message appears (the button keeps a fixed size on mobile and desktop).
    <div className="flex flex-col items-end gap-1.5">
      {mfaRequired && (
        <p className="text-xs w-full text-left sm:text-right" style={{ color: '#F59E0B' }}>
          Two-factor authentication required.{' '}
          <a href="/settings#security" style={{ textDecoration: 'underline', fontWeight: 600 }}>
            Enable in Settings
          </a>
        </p>
      )}
      {error && (
        <p className="text-xs w-full text-left sm:text-right" style={{ color: '#EF4444' }}>{error}</p>
      )}
      <button
        onClick={handleClick}
        disabled={disabled || loading}
        className={className}
        style={{ whiteSpace: 'nowrap', ...style }}
      >
        {loading ? 'Connecting…' : children}
      </button>
    </div>
  )
}
