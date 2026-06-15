'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import type { PlaidLinkOnSuccess } from 'react-plaid-link'
import { PLAID_LINK_TOKEN_KEY } from '@/components/integrations/PlaidLink'

/**
 * Plaid OAuth return page.
 *
 * OAuth institutions send the browser to the bank, then redirect back here (the
 * URL registered as PLAID_REDIRECT_URI / Allowed redirect URI). We re-initialize
 * Link with the SAME link token (persisted before we opened Link) plus
 * `receivedRedirectUri`, which lets the Plaid SDK resume the in-progress flow.
 */
export default function PlaidOAuthReturnPage() {
  const router = useRouter()
  const [{ token, error }, setState] = useState<{ token: string | null; error: string | null }>({
    token: null,
    error: null,
  })

  // Read the persisted token once on mount. Must be in an effect, not a lazy
  // initializer: localStorage is unavailable during server render.
  useEffect(() => {
    const stored = localStorage.getItem(PLAID_LINK_TOKEN_KEY)
    setState(
      stored
        ? { token: stored, error: null }
        : { token: null, error: 'Your bank connection session expired. Please start again.' },
    )
  }, [])

  const setError = useCallback(
    (message: string) => setState((s) => ({ ...s, error: message })),
    [],
  )

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      try {
        const res = await fetch('/api/auth/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken }),
        })
        if (!res.ok) throw new Error('Failed to finish connecting your bank')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        return
      } finally {
        localStorage.removeItem(PLAID_LINK_TOKEN_KEY)
      }
      router.replace('/integrations')
    },
    [router, setError],
  )

  const { open, ready } = usePlaidLink({
    token: token ?? '',
    // The full current URL — Plaid reads the OAuth state from its query string.
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : undefined,
    onSuccess,
    onExit: () => {
      localStorage.removeItem(PLAID_LINK_TOKEN_KEY)
      router.replace('/integrations')
    },
  })

  // Resume Link automatically once it's ready — no extra click on the return leg.
  // Guard with a ref so we open EXACTLY ONCE: `open` changes identity on each
  // render, and without this guard the effect re-fires and the modal reopens in
  // an endless loop.
  const openedRef = useRef(false)
  useEffect(() => {
    if (token && ready && !openedRef.current) {
      openedRef.current = true
      open()
    }
  }, [token, ready, open])

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      {error ? (
        <div className="text-center">
          <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
          <button
            className="mt-3 text-sm underline"
            onClick={() => router.replace('/integrations')}
          >
            Back to integrations
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Finishing your bank connection…</p>
      )}
    </div>
  )
}
