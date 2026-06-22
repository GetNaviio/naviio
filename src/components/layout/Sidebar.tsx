'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Waves, BarChart3,
  CreditCard, Target, Plug, Bell, ChevronRight, Calculator, X, Telescope, Settings, LineChart,
  Users, FolderOpen,
} from 'lucide-react'
import { useTheme } from '@/components/layout/ThemeContext'
import OrgSwitcher from '@/components/layout/OrgSwitcher'

// `firmOnly` items only show for fractional-CFO / advisor accounts; plain
// individual accounts never see the Clients tab.
const nav = [
  { href: '/dashboard',    label: 'Overview',      icon: LayoutDashboard },
  { href: '/pl',           label: 'P&L Statement', icon: TrendingUp },
  { href: '/cash-flow',    label: 'Cash Flow',     icon: Waves },
  { href: '/revenue',      label: 'Revenue',       icon: BarChart3 },
  { href: '/forecast',     label: 'Forecast',      icon: Telescope },
  { href: '/model',        label: 'Financial Model', icon: LineChart },
  { href: '/expenses',     label: 'Expenses',      icon: CreditCard },
  { href: '/kpis',         label: 'KPIs',          icon: Target },
  { href: '/cpa',          label: 'CPA / Tax',     icon: Calculator },
  { href: '/documents',    label: 'Documents',     icon: FolderOpen },
  { href: '/clients',      label: 'Clients',       icon: Users, firmOnly: true },
  { href: '/integrations', label: 'Integrations',  icon: Plug },
  { href: '/alerts',       label: 'Alerts',        icon: Bell, badge: 3 },
  { href: '/settings',     label: 'Settings',      icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { theme } = useTheme()
  // null = not yet known. Start from the last-known value (cached) so the
  // Clients tab doesn't pop in on every load for firm users, then refresh from
  // the server. Init is null on both server and client to avoid a hydration
  // mismatch; the cached value is applied in the effect.
  const [isFirm, setIsFirm] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem('naviio:isFirm')
      if (cached !== null) setIsFirm(cached === '1')
    } catch {}
    fetch('/api/org/switch')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v = !!d?.isFirm
        setIsFirm(v)
        try { window.localStorage.setItem('naviio:isFirm', v ? '1' : '0') } catch {}
      })
      .catch(() => {})
  }, [])

  const items = nav.filter((n) => !n.firmOnly || isFirm === true)

  return (
    <aside
      style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
      className={[
        'fixed left-0 top-0 h-full w-60 flex flex-col border-r z-40 transition-transform duration-300 ease-in-out',
        // Mobile: slide in/out. Desktop: always visible
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      {/* Logo + mobile close */}
      <div className="flex items-center justify-between border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <Link href="/dashboard" onClick={onClose} className="flex justify-center px-3 py-5 flex-1">
          <img
            src={theme === 'light' ? '/naviio-logo-light.png' : '/naviio-logo.png'}
            alt="Naviio"
            className="w-full h-auto object-contain"
            style={{ maxWidth: 210 }}
          />
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-3 mr-1"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          Financial Dashboard
        </p>
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: active ? 'var(--color-info)' : 'var(--color-text-secondary)',
              }}
            >
              <span className="flex items-center gap-3">
                <Icon size={16} />
                {label}
              </span>
              {badge ? (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}>
                  {badge}
                </span>
              ) : active ? (
                <ChevronRight size={14} />
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* User pill + org switcher (real user, real active org, multi-entity) */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
        <OrgSwitcher />
      </div>
    </aside>
  )
}
