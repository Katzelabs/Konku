import type { ReactNode } from 'react'
import { useLogout } from '../../features/auth/useAuth'
import { useDueCards } from '../../features/review/queries'
import { CaptureGate } from '../../features/timer/CaptureGate'
import { FocusPill } from './FocusPill'
import { MobileBottomNav, MobileTopBar } from './MobileNav'
import { Sidebar } from './Sidebar'

/**
 * Sidebar on desktop, top bar plus bottom nav on phones. The main column is a
 * separate scroll container so the sidebar stays put while a long note scrolls.
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
      <Sidebar
        due={dueCount}
        email={email}
        onLogout={() => logout.mutate()}
      />
      <MobileTopBar onLogout={() => logout.mutate()} />

      <main className="flex-1 md:overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-gutter md:py-10">
          {children}
        </div>
      </main>

      <MobileBottomNav due={dueCount} />

      {/* Both live outside the routed content so a session that ends while you
          are reading a note still surfaces (D-036). */}
      <FocusPill />
      <CaptureGate />
    </div>
  )
}
