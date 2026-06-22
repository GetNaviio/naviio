import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import DashboardShell from '@/components/layout/DashboardShell'
import RefreshBoundary from '@/components/layout/RefreshBoundary'
import ChatBot from '@/components/ChatBot'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole dashboard server-side: an unauthenticated (or expired) session
  // must bounce to /login, not render a logged-in-looking shell whose API calls
  // then all 401. Runs on every dashboard route.
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <DashboardShell>
      <RefreshBoundary>{children}</RefreshBoundary>
      <ChatBot />
    </DashboardShell>
  )
}
