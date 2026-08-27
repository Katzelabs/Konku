import { GraduationCap } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useCopy } from '../../i18n'
import { cn } from '../../lib/utils'
import { Separator } from '../ui/separator'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './Nav'

export function Sidebar({
  due,
  collapsed,
}: {
  due: number
  collapsed: boolean
}) {
  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col justify-between border-r border-border bg-card px-3 py-4 md:flex',
        'transition-[width] duration-(--animate-duration-calm) ease-(--ease-quiet)',
        collapsed ? 'w-16' : 'w-sidebar',
      )}
    >
      <div className="flex flex-col gap-6">
        <div
          className={cn(
            'flex h-9 items-center gap-2.5',
            collapsed ? 'justify-center' : 'px-2',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg">
            <GraduationCap className="size-4" />
          </span>
          {!collapsed && (
            <span className="truncate text-lg font-bold text-card-fg">
              {'Konku' /* i18n-exempt: the product's name, not copy */}
            </span>
          )}
        </div>

        <nav className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} due={due} collapsed={collapsed} />
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        <Separator />
        <nav className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} due={due} collapsed={collapsed} />
          ))}
        </nav>
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  due,
  collapsed,
}: {
  item: NavItem
  due: number
  collapsed: boolean
}) {
  const Icon = item.icon
  const showDue = item.showsDue && due > 0
  const { pathname } = useLocation()
  const copy = useCopy()
  // The destination's name comes from the area that owns the screen, resolved
  // here against the locale being rendered (Nav.tsx).
  const label = item.label(copy)
  // A settings screen that lives at its own URL still lights Pengaturan up.
  const alsoActive = item.alsoActiveOn?.test(pathname) ?? false

  return (
    <NavLink
      to={item.to}
      end={item.end}
      // The label is gone when collapsed, so the accessible name has to come
      // from somewhere; title also gives a hover tooltip for free.
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md py-2 text-sm transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
          collapsed ? 'justify-center px-0' : 'px-3',
          isActive || alsoActive
            ? 'bg-accent font-semibold text-accent-fg'
            : 'font-medium text-muted-fg hover:bg-muted hover:text-surface-fg',
        )
      }
    >
      <span className="relative flex shrink-0 items-center">
        <Icon className="size-5" />
        {/*
          Collapsed, the count has nowhere to sit but on the icon. Still grey
          and still absent at zero — an empty day is a normal day (GOALS.md).
        */}
        {collapsed && showDue && (
          <span className="absolute -top-1.5 -right-2 rounded-full bg-muted px-1 text-[9px] font-medium text-muted-fg tabular-nums">
            {due}
          </span>
        )}
      </span>

      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {showDue && (
            <span className="text-xs text-subtle-fg tabular-nums">{due}</span>
          )}
        </>
      )}
    </NavLink>
  )
}
