import { GraduationCap, LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { PRIMARY_NAV, SECONDARY_NAV } from './Nav'

/**
 * Phone layout. `04-ship.md` S2 is only done when you can log in from your
 * phone, so this is not an afterthought — but the Figma mockup has no mobile
 * frames, so the shape here is derived rather than copied.
 *
 * A bottom bar rather than a drawer: the four daily destinations should be one
 * thumb-reach away, and a hamburger would hide the due count. Domain rides
 * along as a fifth item instead of living behind a menu, which keeps the whole
 * app reachable without a dropdown primitive.
 */

export function MobileTopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-fg">
          <GraduationCap className="size-3.5" />
        </span>
        <span className="font-bold text-card-fg">Konku</span>
      </div>
      <button
        onClick={onLogout}
        aria-label="Keluar"
        className="rounded-md p-1.5 text-subtle-fg hover:bg-muted hover:text-surface-fg"
      >
        <LogOut className="size-4" />
      </button>
    </header>
  )
}

export function MobileBottomNav({ due }: { due: number }) {
  const items = [...PRIMARY_NAV, ...SECONDARY_NAV]
  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-card md:hidden">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors',
                isActive
                  ? 'font-semibold text-primary'
                  : 'text-muted-fg hover:text-surface-fg',
              )
            }
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.showsDue && due > 0 && (
                <span className="absolute -top-1 -right-2 rounded-full bg-muted px-1 text-[10px] font-medium text-muted-fg tabular-nums">
                  {due}
                </span>
              )}
            </span>
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
