'use client'

import { useEffect } from 'react'

// Injects ngrok-skip-browser-warning on every fetch so API calls
// aren't intercepted by the ngrok interstitial page.
export default function NgrokPatch() {
  useEffect(() => {
    const original = window.fetch
    window.fetch = (input, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('ngrok-skip-browser-warning', 'true')
      return original(input, { ...init, headers })
    }
    return () => { window.fetch = original }
  }, [])
  return null
}
