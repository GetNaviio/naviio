'use client'

import { Search, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from './ThemeContext'
import CommandPalette from './CommandPalette'
import NotificationsBell from './NotificationsBell'
import BrandMenu from './BrandMenu'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Cmd/Ctrl+K toggles the palette; the mobile brand menu opens it via an event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    const onOpenSearch = () => setSearchOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('naviio:open-search', onOpenSearch)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('naviio:open-search', onOpenSearch)
    }
  }, [])

  // Broadcast a refresh that every usePageData page (and the bell) listens for,
  // and refresh server components. Brief spinner = honest feedback.
  function handleRefresh() {
    setRefreshing(true)
    window.dispatchEvent(new CustomEvent('naviio:refresh'))
    router.refresh()
    setTimeout(() => setRefreshing(false), 900)
  }

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b"
      style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand icon → account/utilities menu (mobile only; replaces the hamburger) */}
        <BrandMenu />

        <div className="min-w-0">
          {title && <h1 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>}
          {subtitle && <p className="text-xs mt-0.5 truncate hidden sm:block" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Live badge — desktop only (utilities move into the brand menu on mobile) */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
          <span>Live</span>
        </div>

        <button
          onClick={handleRefresh}
          className="hidden lg:block p-2 rounded-lg transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Refresh data"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>

        {/* Bell — shown on every screen size */}
        <NotificationsBell />

        <button onClick={toggleTheme} className="hidden lg:block p-2 rounded-lg transition-colors" style={{ color: 'var(--color-text-secondary)' }} aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        {/* Search — desktop only; mobile opens it from the brand menu */}
        <div className="hidden lg:block pl-2 border-l" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }}
            aria-label="Search"
          >
            <Search size={13} />
            <span className="text-sm">Search</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded ml-1" style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>⌘K</kbd>
          </button>
        </div>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
