import type { ReactNode } from 'react'
import { useLogout } from '../../features/auth/useAuth'
import { useDueCards } from '../../features/review/queries'
import { CaptureGate } from '../../features/timer/CaptureGate'
import { MobileBottomNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/**
 * Sidebar on desktop, bottom nav on phones, top bar on both. The main column
 * is a separate scroll container so the sidebar stays put while a long note
 * scrolls.
 */
export function AppShell({
  email,
  children,
}: {
  email: string
  children: ReactNode
}) {
  const logout = useLogout()
  const due = useDueCards()
  const dueCount = due.data?.total ?? 0

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden">
      <Sidebar due={dueCount} />

      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <TopBar email={email} onLogout={() => logout.mutate()} />

        <main className="flex-1 md:overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-gutter md:py-8">
            {children}
          </div>
        </main>
      </div>

      <MobileBottomNav due={dueCount} />

      {/* Outside the routed content so a session that ends while you are
          reading a note still surfaces (D-036). */}
      <CaptureGate />
    </div>
  )
}
