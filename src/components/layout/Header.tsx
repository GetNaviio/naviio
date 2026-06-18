'use client'

import { Search, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTheme } from './ThemeContext'
import CommandPalette from './CommandPalette'
import NotificationsBell from './NotificationsBell'
import BrandMenu from './BrandMenu'
import HeaderControls from './HeaderControls'

interface HeaderProps {
  title?: string
  subtitle?: string
  /** Show the YTD / This-Month selector in the top-right cluster (data pages). */
  showPeriod?: boolean
}

export default function Header({ title, subtitle, showPeriod = false }: HeaderProps) {
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

  return (
    <>
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b"
      style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand icon → account/utilities menu (mobile only; replaces the hamburger) */}
        <BrandMenu />

        {/* Title — inline on desktop; on mobile it drops below the bar (see below) */}
        <div className="min-w-0 hidden lg:block">
          {title && <h1 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>}
          {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>
      </div>

      {/* Icon cluster matches the Overview exactly: search · theme · bell · org/period · profile */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Search — desktop only; mobile opens it from the brand menu */}
        <button onClick={() => setSearchOpen(true)} className="hidden lg:block p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }} aria-label="Search">
          <Search size={16} />
        </button>

        {/* Theme — desktop only */}
        <button onClick={toggleTheme} className="hidden lg:block p-2 rounded-lg transition-colors hover:bg-white/5" style={{ color: 'var(--color-text-secondary)' }} aria-label="Toggle theme">
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* Bell — shown on every screen size */}
        <NotificationsBell />

        {/* Org / entity switcher + period + profile — aligns every tab with the Overview */}
        <HeaderControls showPeriod={showPeriod} />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>

    {/* Mobile: page title sits below the bar (scrolls away), so the sticky header
        stays just the icon + bell. */}
    {title && (
      <div className="lg:hidden px-4 pt-4 pb-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
        {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
      </div>
    )}
    </>
  )
}
