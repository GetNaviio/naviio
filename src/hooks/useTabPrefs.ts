'use client'

import { useEffect, useState } from 'react'

/**
 * Persisted choice of which pages occupy the mobile bottom bar's customizable
 * slots. localStorage (not session) so the layout sticks across visits. SSR-safe:
 * the stored value is read in an effect, so the first paint uses the defaults.
 */
const KEY = 'naviio:mobile-tabs'

export function useTabPrefs(defaults: string[]): [string[], (next: string[]) => void] {
  const [tabs, setTabs] = useState<string[]>(defaults)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTabs(parsed.filter((x) => typeof x === 'string'))
      }
    } catch { /* unavailable storage → keep defaults */ }
  }, [])

  const update = (next: string[]) => {
    setTabs(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  return [tabs, update]
}
