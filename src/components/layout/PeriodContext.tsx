'use client'

/**
 * Global reporting period shared by the header selector and the data pages.
 * 'ytd' = year-to-date, 'month' = current month. Persisted so it survives
 * navigation and reloads. Pages that support a month scope read this and
 * re-scope their figures; pages that don't simply ignore it.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Period = 'ytd' | 'month'

const PeriodContext = createContext<{ period: Period; setPeriod: (p: Period) => void }>({
  period: 'ytd',
  setPeriod: () => {},
})

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>('ytd')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('naviio:period')
      if (stored === 'month' || stored === 'ytd') setPeriodState(stored)
    } catch { /* ignore */ }
  }, [])

  const setPeriod = (p: Period) => {
    setPeriodState(p)
    try { localStorage.setItem('naviio:period', p) } catch { /* ignore */ }
  }

  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>
}

export const usePeriod = () => useContext(PeriodContext)
