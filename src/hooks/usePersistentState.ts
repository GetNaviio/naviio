'use client'

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * useState that survives route changes: the value is mirrored to
 * sessionStorage and restored on mount, so navigating between dashboard tabs
 * doesn't reset selections (selected month, active sub-tab, etc.).
 *
 * sessionStorage (not localStorage) on purpose — selections belong to the
 * working session, and it clears when the browser tab closes. The restore
 * happens in an effect (not the initializer) to avoid SSR hydration
 * mismatches; the one-frame flash of the default is invisible behind the
 * pages' loading skeletons.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial)
  const skipFirstWrite = useRef(true)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw != null) setValue(JSON.parse(raw) as T)
    } catch {
      /* corrupted/unavailable storage → keep the default */
    }
  }, [key])

  useEffect(() => {
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false // never clobber the stored value with the default on mount
      return
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full/unavailable — selection just won't persist */
    }
  }, [key, value])

  return [value, setValue]
}
