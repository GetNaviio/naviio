'use client'

/**
 * Shared data-fetching hook for dashboard pages.
 *
 * Replaces the hand-rolled pattern copy-pasted across pages:
 *   const [data, setData] = useState(null)
 *   const [loading, setLoading] = useState(true)
 *   useEffect(() => { let alive = true; fetch(...).then(...) ... }, [])
 *
 * What it adds over that pattern:
 * - AbortController cleanup (the `alive` flag let in-flight requests complete
 *   pointlessly after unmount; abort actually cancels them)
 * - A real error state — previously a failed fetch was indistinguishable from
 *   "no data connected", so outages rendered a misleading connect prompt
 * - `refetch()` for retry buttons
 *
 * Usage — single endpoint:
 *   const { data, loading, error, refetch } = useApi<PLResponse>('/api/pl')
 *
 * Usage — parallel endpoints (page composes its own loader):
 *   const { data, loading, error, refetch } = usePageData(
 *     useCallback(async (signal) => {
 *       const [m, sm] = await Promise.all([
 *         fetchJson<Metrics>('/api/metrics', signal),          // required
 *         fetchJson<Stripe>('/api/stripe/metrics', signal).catch(() => null), // optional
 *       ])
 *       return { m, sm }
 *     }, []),
 *   )
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Error carrying the HTTP status so callers can branch (e.g. 401 → re-login). */
export class HttpError extends Error {
  status: number
  constructor(url: string, status: number) {
    super(`${url} responded ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

/** GET a JSON endpoint; throws (with status) on network error or non-2xx. */
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new HttpError(url, res.status)
  return res.json() as Promise<T>
}

export type PageDataState<T> = {
  data: T | null
  loading: boolean
  /** Set on loader failure. Aborts (unmount/refetch) never count as errors. */
  error: string | null
  refetch: () => void
}

export function usePageData<T>(loader: (signal: AbortSignal) => Promise<T>): PageDataState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller

    setLoading(true)
    setError(null)

    loader(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        // Session expired/invalid (the cookie outlived the JWT, or it was
        // revoked): every data call 401s, so don't paint a scary error on each
        // tab — bounce to login and come back to where they were.
        if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
          if (typeof window !== 'undefined') {
            const next = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.replace(`/login?next=${next}`)
          }
          return
        }
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setLoading(false)
      })

    return () => controller.abort()
  }, [loader, generation])

  const refetch = useCallback(() => setGeneration((g) => g + 1), [])

  return { data, loading, error, refetch }
}

/** Sugar for the single-endpoint case. */
export function useApi<T>(url: string): PageDataState<T> {
  const loader = useCallback((signal: AbortSignal) => fetchJson<T>(url, signal), [url])
  return usePageData(loader)
}
