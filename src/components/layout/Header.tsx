'use client'

import { Bell, Search, RefreshCw, Menu } from 'lucide-react'
import { useState } from 'react'
import { useSidebar } from './SidebarContext'
import { useTheme } from './ThemeContext'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { toggle } = useSidebar()
  const [refreshing, setRefreshing] = useState(false)
  const { theme, toggleTheme } = useTheme()

  function handleRefresh() {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1500)
  }

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b"
      style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="lg:hidden p-2 -ml-1 rounded-lg transition-colors flex-shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          {title && <h1 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>}
          {subtitle && <p className="text-xs mt-0.5 truncate hidden sm:block" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Live badge — hide label on very small screens */}
        <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
          <span className="hidden sm:inline">Live</span>
        </div>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Refresh data"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>

        <button className="p-2 rounded-lg transition-colors relative" style={{ color: 'var(--color-text-secondary)' }} aria-label="Notifications">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
        </button>

        <button onClick={toggleTheme} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--color-text-secondary)' }} aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        {/* Search — icon only on mobile, full button on sm+ */}
        <div className="pl-1 sm:pl-2 border-l" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-sm transition-colors" style={{ backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }} aria-label="Search">
            <Search size={13} />
            <span className="hidden sm:inline text-sm">Search...</span>
          </button>
        </div>
      </div>
    </header>
  )
}
