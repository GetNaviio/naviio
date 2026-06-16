'use client'

/**
 * Universal data refresh for the dashboard. The Header refresh button broadcasts
 * `naviio:refresh`; this boundary bumps a key on the subtree it wraps, remounting
 * the active page so every page re-runs its data fetches — no per-page wiring,
 * regardless of whether a page uses usePageData or hand-rolled fetching.
 */
import { Fragment, useEffect, useState } from 'react'

export default function RefreshBoundary({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState(0)

  useEffect(() => {
    const onRefresh = () => setKey((k) => k + 1)
    window.addEventListener('naviio:refresh', onRefresh)
    return () => window.removeEventListener('naviio:refresh', onRefresh)
  }, [])

  return <Fragment key={key}>{children}</Fragment>
}
