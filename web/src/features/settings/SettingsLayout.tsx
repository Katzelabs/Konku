import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PageHeader } from '../../components/ui/page-header'
import { cn } from '../../lib/utils'
import { SETTINGS_ITEMS, SETTINGS_NAV } from './nav'

/**
 * The shell every settings screen renders inside: the page title once, a rail
 * of sections beside it, and one section at a time in the column.
 *
 * It is a pathless layout route (`App.tsx`), which is what lets `/domains` and
 * `/categories` sit in the same shell without moving under `/settings/`. Those
 * two used to open a bare page with an "← Pengaturan" link at the top, so
 * getting from Domain to Kategori was two navigations through a screen you did
 * not want. From the rail it is one, and the rail says where you are.
 *
 * There is no back link here for the same reason: the section you are on is
 * highlighted in a nav that never leaves, so there is nothing to go back *to*
 * that is not already on screen.
 */
export default function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengaturan"
        description="Akun, label, tampilan, dan datamu."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <SettingsRail />
        <SettingsTabs />

        {/*
          Capped, not full width. A settings form is a column of short rows and
          a single sentence of explanation; letting it run to 1600px would put
          the label of a row at one edge of the screen and its switch at the
          other.
        */}
        <div className="min-w-0 max-w-3xl">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Desktop: grouped, vertical, and sticky so it survives a long section. */
function SettingsRail() {
  return (
    <nav
      aria-label="Bagian pengaturan"
      className="hidden flex-col gap-5 lg:sticky lg:top-0 lg:flex"
    >
      {SETTINGS_NAV.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium tracking-wide text-subtle-fg uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <SettingsNavLink key={item.to} item={item} />
          ))}
        </div>
      ))}
    </nav>
  )
}

/**
 * Phones: the same destinations as one scrolling row.
 *
 * Not the grouped list the rail is. A phone has room for the nav or the
 * section, not both, and a full-height menu you have to walk back through is
 * the shape this rework is undoing — a strip keeps every section one tap away
 * from every other. It bleeds into the gutter so the last item is visibly cut
 * off rather than sitting flush at the edge looking like the end of the list.
 */
function SettingsTabs() {
  const { pathname } = useLocation()
  const strip = useRef<HTMLElement>(null)

  /*
   * Scroll the open section into the strip.
   *
   * Seven items do not fit across a phone, so arriving at Data & privasi from
   * a link put the current section off the right-hand edge: the nav claimed
   * you were on Profil, which is the one thing a nav must never do. Found by
   * looking at the screen; there is no test for it because jsdom has no
   * layout to scroll.
   */
  useEffect(() => {
    const current = strip.current?.querySelector('[aria-current="page"]')
    current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [pathname])

  return (
    <nav
      ref={strip}
      aria-label="Bagian pengaturan"
      className="-mx-4 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-2">
        {SETTINGS_ITEMS.map((item) => (
          <SettingsNavLink key={item.to} item={item} />
        ))}
      </div>
    </nav>
  )
}

function SettingsNavLink({ item }: { item: (typeof SETTINGS_ITEMS)[number] }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors duration-(--animate-duration-quick) ease-(--ease-quiet)',
          isActive
            ? 'bg-accent font-semibold text-accent-fg'
            : 'font-medium text-muted-fg hover:bg-muted hover:text-surface-fg',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </NavLink>
  )
}
