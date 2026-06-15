"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'dark', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('app-theme')
      if (saved === 'light') setTheme('light')
    } catch {}
  }, [])

  useEffect(() => {
    const el = document.getElementById('app-root')
    if (el) {
      if (theme === 'light') el.classList.add('light')
      else el.classList.remove('light')
    }
    // Mirror onto <html>: the document root sits BEHIND #app-root, so without
    // this the page edge (elastic overscroll, area under fixed widgets) stays
    // dark navy in light mode.
    document.documentElement.classList.toggle('light', theme === 'light')
    try { localStorage.setItem('app-theme', theme) } catch {}

    // Swap any theme-aware images: elements with data-theme-src-light / data-theme-src-dark
    try {
      document.querySelectorAll<HTMLImageElement>('[data-theme-src-light]').forEach(img => {
        const light = img.getAttribute('data-theme-src-light')
        const dark = img.getAttribute('data-theme-src-dark')
        if (theme === 'light' && light) img.src = light
        else if (theme === 'dark' && dark) img.src = dark
      })
    } catch {}

    // Leaving the dashboard (e.g. to the dark landing page) must not leak the
    // light root background there.
    return () => document.documentElement.classList.remove('light')
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
