import DashboardShell from '@/components/layout/DashboardShell'
import ChatBot from '@/components/ChatBot'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      {children}
      <ChatBot />
    </DashboardShell>
  )
}
