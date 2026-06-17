'use client'

import { SidebarProvider, useSidebar } from './SidebarContext'
import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'
import type { ReactNode } from 'react'
import { ThemeProvider } from './ThemeContext'
import { PeriodProvider } from './PeriodContext'

function ShellInner({ children }: { children: ReactNode }) {
  const { open, close } = useSidebar()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* `app-root` wraps the entire dashboard (sidebar + main) so theme variables apply to all parts */}
      <div id="app-root" className="relative min-h-screen">
        <Sidebar isOpen={open} onClose={close} />
        {/* Main — offset only on desktop; pad the bottom on mobile so the tab bar never covers content */}
        <div className="flex flex-col lg:ml-60 pb-16 lg:pb-0" style={{ backgroundColor: 'var(--color-surface-bg)', minHeight: '100vh' }}>
          {children}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileTabBar />
    </>
  )
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <ThemeProvider>
        <PeriodProvider>
          <ShellInner>{children}</ShellInner>
        </PeriodProvider>
      </ThemeProvider>
    </SidebarProvider>
  )
}
