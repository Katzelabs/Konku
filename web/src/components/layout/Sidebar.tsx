import { GraduationCap } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Separator } from '../ui/separator'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './Nav'

export function Sidebar({ due }: { due: number }) {
  return (
    <aside className="hidden w-sidebar shrink-0 flex-col justify-between border-r border-border bg-card p-6 md:flex">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-fg">
            <GraduationCap className="size-4" />
          </span>
          <span className="text-lg font-bold text-card-fg">Konku</span>
        </div>

        <nav className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} due={due} />
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-4">
        <Separator />
        <nav className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} due={due} />
          ))}
        </nav>
      </div>
    </aside>
  )
}

function SidebarLink({ item, due }: { item: NavItem; due: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
          isActive
            ? 'bg-accent font-semibold text-accent-fg'
            : 'font-medium text-muted-fg hover:bg-muted hover:text-surface-fg',
        )
      }
    >
      <Icon className="size-5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {/*
        A quiet count, not a badge demanding attention. It stays grey and says
        nothing at zero, because an empty day is a normal day and not a failure
        to fix (GOALS.md).
      */}
      {item.showsDue && due > 0 && (
        <span className="text-xs text-subtle-fg tabular-nums">{due}</span>
      )}
    </NavLink>
  )
}
