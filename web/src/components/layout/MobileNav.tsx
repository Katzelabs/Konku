import { NavLink } from 'react-router-dom'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { PRIMARY_NAV } from './Nav'

/**
 * Phone navigation. `04-ship.md` S2 is only done when you can log in from your
 * phone, so this is not an afterthought — but the Figma mockup has no mobile
 * frames, so the shape here is derived rather than copied.
 *
 * A bottom bar rather than a drawer: the daily destinations should be one
 * thumb-reach away, and a hamburger would hide the due count. Pengaturan is
 * not here — it lives in the account menu in the top bar, which is where a
 * settings link is looked for anyway.
 */
export function MobileBottomNav({ due }: { due: number }) {
  const copy = useCopy()

  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-card md:hidden">
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] transition-colors',
                isActive
                  ? 'font-semibold text-primary-ink'
                  : 'text-muted-fg hover:text-surface-fg',
              )
            }
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.showsDue && due > 0 && (
                <span className="absolute -top-1 -right-2.5 rounded-full bg-muted px-1 text-[9px] font-medium text-muted-fg tabular-nums">
                  {due}
                </span>
              )}
            </span>
            {item.label(copy)}
          </NavLink>
        )
      })}
    </nav>
  )
}
