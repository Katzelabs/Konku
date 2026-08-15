import type { ReactNode } from 'react'
import { useLogout, type User } from '../../features/auth/useAuth'
import { useDueCards } from '../../features/review/queries'
import { CaptureGate } from '../../features/timer/CaptureGate'
import { MobileBottomNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useSidebar } from './useSidebar'

/**
 * Sidebar on desktop, bottom nav on phones, top bar on both. The main column
 * is a separate scroll container so the sidebar stays put while a long note
 * scrolls.
 *
 * The content area is full width — the gutter is the only thing between the
 * page and the edge. Any narrower measure is the page's own decision, because
 * a settings form and a note editor do not want the same width.
 */
export function AppShell({
  user,
  children,
}: {
  // The whole user, not just the address: since 00010 the account menu shows a
  // name when there is one, and passing two or three fields down separately is
  // how one of them gets forgotten at the next call site.
  user: User
  children: ReactNode
}) {
  const logout = useLogout()
  const due = useDueCards()
  const dueCount = due.data?.total ?? 0
  const sidebar = useSidebar()

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden">
      {/*
        First in the DOM, invisible until it is focused (F-12).

        Without it, reaching the page with a keyboard means tabbing the whole
        sidebar and the top bar again after every navigation — the nav is the
        same nav each time, and it sits before the only thing that changed.
        The ring comes from the global :focus-visible rule in theme.css.
      */}
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-card-fg"
      >
        Lewati ke konten
      </a>

      <Sidebar due={dueCount} collapsed={sidebar.collapsed} />

      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <TopBar
          user={user}
          onLogout={() => logout.mutate()}
          sidebarCollapsed={sidebar.collapsed}
          onToggleSidebar={sidebar.toggle}
        />

        {/* tabIndex -1 so the skip link actually moves focus here and not
            just the scroll position — a jump that leaves focus in the nav
            puts the next Tab back at the top of the sidebar. */}
        <main id="konten" tabIndex={-1} className="flex-1 md:overflow-y-auto">
          <div className="px-4 py-6 md:px-gutter md:py-8">{children}</div>
        </main>
      </div>

      <MobileBottomNav due={dueCount} />

      {/* Outside the routed content so a session that ends while you are
          reading a note still surfaces (D-036). */}
      <CaptureGate />
    </div>
  )
}
