import DashboardShell from '@/components/layout/DashboardShell'
import RefreshBoundary from '@/components/layout/RefreshBoundary'
import ChatBot from '@/components/ChatBot'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <RefreshBoundary>{children}</RefreshBoundary>
      <ChatBot />
    </DashboardShell>
  )
}
