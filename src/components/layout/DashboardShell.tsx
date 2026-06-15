'use client'

import { SidebarProvider, useSidebar } from './SidebarContext'
import Sidebar from './Sidebar'
import type { ReactNode } from 'react'
import { ThemeProvider } from './ThemeContext'

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
        {/* Main — offset only on desktop */}
        <div className="flex flex-col lg:ml-60" style={{ backgroundColor: 'var(--color-surface-bg)', minHeight: '100vh' }}>
          {children}
        </div>
      </div>
    </>
  )
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <ThemeProvider>
        <ShellInner>{children}</ShellInner>
      </ThemeProvider>
    </SidebarProvider>
  )
}
