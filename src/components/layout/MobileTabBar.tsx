'use client'

/**
 * Mobile bottom navigation (lg:hidden). A native-app style tab bar:
 *   [Overview · slot · (Navi) · slot · More]
 * Overview is pinned, the two slots are user-customizable (persisted via
 * useTabPrefs), the prominent center button opens Navi (dispatches
 * `naviio:open-navi`, which ChatBot listens for), and More opens a sheet with
 * every other page plus the "Customize tabs" editor.
 */
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Waves, FileText, BarChart3, Telescope, LineChart, CreditCard, Target,
  Calculator, Plug, Wallet, Bell, Settings, MoreHorizontal, Sparkles, X, Check,
} from 'lucide-react'
import { useTabPrefs } from '@/hooks/useTabPrefs'

interface NavDef { id: string; label: string; href: string; icon: typeof Home }

const CATALOG: NavDef[] = [
  { id: 'overview', label: 'Overview', href: '/dashboard', icon: Home },
  { id: 'cash-flow', label: 'Cash', href: '/cash-flow', icon: Waves },
  { id: 'pl', label: 'P&L', href: '/pl', icon: FileText },
  { id: 'revenue', label: 'Revenue', href: '/revenue', icon: BarChart3 },
  { id: 'forecast', label: 'Forecast', href: '/forecast', icon: Telescope },
  { id: 'model', label: 'Model', href: '/model', icon: LineChart },
  { id: 'expenses', label: 'Expenses', href: '/expenses', icon: CreditCard },
  { id: 'kpis', label: 'KPIs', href: '/kpis', icon: Target },
  { id: 'cpa', label: 'CPA / Tax', href: '/cpa', icon: Calculator },
  { id: 'integrations', label: 'Integrations', href: '/integrations', icon: Plug },
  { id: 'billing', label: 'Credits', href: '/settings#billing', icon: Wallet },
  { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
]
const PINNED = 'overview'
const DEFAULT_SLOTS = ['cash-flow', 'pl']
const byId = (id: string) => CATALOG.find((c) => c.id === id)

const ACTIVE = 'var(--color-info)'
const MUTED = 'var(--color-text-muted)'

export default function MobileTabBar() {
  const pathname = usePathname()
  const [slots, setSlots] = useTabPrefs(DEFAULT_SLOTS)
  const [sheet, setSheet] = useState<'none' | 'more' | 'customize'>('none')

  const slotItems = slots.map(byId).filter(Boolean) as NavDef[]
  const onBar = new Set<string>([PINNED, ...slots])
  const moreItems = CATALOG.filter((c) => !onBar.has(c.id))

  const pathActive = (href: string) => {
    const base = href.split('#')[0]
    return pathname === base || (base !== '/dashboard' && pathname.startsWith(base))
  }
  // "More" is active when the current page isn't one of the bar tabs.
  const onBarActive = pathActive('/dashboard') || slotItems.some((s) => pathActive(s.href))

  function openNavi() { window.dispatchEvent(new CustomEvent('naviio:open-navi')) }

  function toggleSlot(id: string) {
    if (slots.includes(id)) setSlots(slots.filter((x) => x !== id))
    else if (slots.length < 2) setSlots([...slots, id])
    else setSlots([slots[1], id]) // full → drop the oldest, keep most recent two
  }

  const tab = (item: NavDef) => {
    const active = pathActive(item.href)
    const Icon = item.icon
    return (
      <Link key={item.id} href={item.href} onClick={() => setSheet('none')}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5"
        style={{ color: active ? ACTIVE : MUTED }} aria-label={item.label}>
        <Icon size={21} />
        <span style={{ fontSize: 10 }}>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Bottom bar — mobile only */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden flex items-stretch"
        style={{
          backgroundColor: 'var(--color-surface-card)',
          borderTop: '1px solid var(--color-surface-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        aria-label="Primary"
      >
        {tab(byId(PINNED)!)}
        {slotItems[0] && tab(slotItems[0])}

        {/* Center Navi button */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={openNavi}
            aria-label="Open Navi"
            className="flex flex-col items-center justify-center"
            style={{ marginTop: -18 }}
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #00B894, #00C49F)' }}
            >
              <Sparkles size={22} className="text-white" />
            </span>
            <span style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Navi</span>
          </button>
        </div>

        {slotItems[1] && tab(slotItems[1])}
        <button
          onClick={() => setSheet('more')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5"
          style={{ color: !onBarActive ? ACTIVE : MUTED }} aria-label="More"
        >
          <MoreHorizontal size={21} />
          <span style={{ fontSize: 10 }}>More</span>
        </button>
      </nav>

      {/* Bottom sheet — More / Customize */}
      {sheet !== 'none' && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setSheet('none')} aria-hidden="true" />
          <div
            className="relative rounded-t-2xl max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--color-surface-card)', borderTop: '1px solid var(--color-surface-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {sheet === 'more' ? 'More' : 'Customize tabs'}
              </p>
              <button onClick={() => setSheet('none')} aria-label="Close" style={{ color: MUTED }}><X size={18} /></button>
            </div>

            {sheet === 'more' ? (
              <div className="p-2">
                <div className="grid grid-cols-3 gap-1.5 p-1.5">
                  {moreItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link key={item.id} href={item.href} onClick={() => setSheet('none')}
                        className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-colors"
                        style={{ backgroundColor: 'var(--color-surface-bg)', color: 'var(--color-text-secondary)' }}>
                        <Icon size={20} style={{ color: pathActive(item.href) ? ACTIVE : 'var(--color-text-secondary)' }} />
                        <span style={{ fontSize: 11 }}>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
                <button
                  onClick={() => setSheet('customize')}
                  className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
                  style={{ color: ACTIVE, backgroundColor: 'rgba(59,130,246,0.1)' }}
                >
                  <Settings size={15} /> Customize tabs
                </button>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs mb-2 px-1" style={{ color: MUTED }}>
                  Pick up to 2 tabs for the bar. Overview and More are always shown; the rest live here.
                </p>
                <div className="space-y-1.5">
                  {CATALOG.filter((c) => c.id !== PINNED).map((item) => {
                    const Icon = item.icon
                    const chosen = slots.includes(item.id)
                    return (
                      <button key={item.id} onClick={() => toggleSlot(item.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                        style={{ backgroundColor: 'var(--color-surface-bg)', border: `1px solid ${chosen ? ACTIVE : 'var(--color-surface-border)'}` }}>
                        <Icon size={18} style={{ color: 'var(--color-text-secondary)' }} />
                        <span className="flex-1 text-left text-sm" style={{ color: 'var(--color-text-primary)' }}>{item.label}</span>
                        {chosen
                          ? <span className="flex items-center gap-1 text-xs" style={{ color: ACTIVE }}>{slots.indexOf(item.id) + 1} <Check size={15} /></span>
                          : <span style={{ fontSize: 11, color: MUTED }}>Add</span>}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setSlots(DEFAULT_SLOTS)}
                  className="w-full mt-3 py-2 rounded-xl text-xs font-medium"
                  style={{ color: MUTED, border: '1px solid var(--color-surface-border)' }}
                >
                  Reset to default
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
