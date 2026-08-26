import {
  Database,
  Info,
  MonitorSmartphone,
  Palette,
  Shapes,
  SlidersHorizontal,
  Tags,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsCopy } from '../../i18n/areas/settings/types'

/**
 * The settings destinations, in one place so the rail, the phone tab strip and
 * the breadcrumb trail cannot drift apart — the same reason `Nav.tsx` exists
 * for the app's own nav.
 *
 * Pengaturan used to be one column with seven sections stacked in it: account,
 * export, sessions, theme, deletion, legal text and two links out. All of it
 * was on screen at once, which meant the account you came to check sat above a
 * delete-account button you did not, and the page had no shape you could
 * learn. Each section is a route now, and this is the map.
 *
 * Domain and Kategori keep their own top-level URLs (`/domains`,
 * `/categories`) — they were linkable and bookmarkable before this split, and
 * breaking those links to make the paths tidier would be a cost with no
 * benefit. They render inside the settings shell all the same, which is what
 * the pathless layout route in `App.tsx` is for.
 *
 * ── A label is copy, and this is a data file (ticket 11 I5) ─────────────────
 *
 * So the words left. What stayed is the part that does not translate: the
 * routes, the icons, the grouping and the order. A label is now a *selector*
 * over `SettingsCopy` rather than a string, which keeps this module a plain
 * constant — read at import time by three different renderers — while making
 * every reader resolve the word against the locale it is rendering in.
 *
 * The alternative was a hook returning the built list, and it was rejected:
 * `settingsItemFor` is called from `crumbsFor`, which is not a component and
 * has no business becoming one, and `SettingsLayout.test.tsx` iterates the
 * list outside React entirely.
 *
 * Two of the eight labels name screens this feature does not own. They are
 * `settings.nav.*` all the same, because the rail is settings' surface and one
 * catalog area may not reach into another's directory.
 */
export interface SettingsNavItem {
  to: string
  /**
   * The rail's word for this destination, resolved against a catalog. Not the
   * heading of the screen it opens: two of these already differ from it, and
   * the pairs that currently match are still free to stop matching.
   */
  label: (c: SettingsCopy) => string
  icon: LucideIcon
}

export interface SettingsNavGroup {
  /** Shown above the group in the desktop rail. The phone strip is flat. */
  label: (c: SettingsCopy) => string
  items: SettingsNavItem[]
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: (c) => c.nav.groups.account,
    items: [
      { to: '/settings/akun', label: (c) => c.nav.profile, icon: UserRound },
      { to: '/settings/perangkat', label: (c) => c.nav.devices, icon: MonitorSmartphone },
    ],
  },
  {
    label: (c) => c.nav.groups.labels,
    items: [
      { to: '/domains', label: (c) => c.nav.domains, icon: Tags },
      { to: '/categories', label: (c) => c.nav.categories, icon: Shapes },
    ],
  },
  {
    label: (c) => c.nav.groups.app,
    items: [
      // Preferensi before Tampilan: one is stored on the account and travels,
      // the other is stored on this device and does not. The screens say so,
      // and the order puts the account-level one first for the same reason the
      // Akun group is at the top.
      { to: '/settings/preferensi', label: (c) => c.nav.preferences, icon: SlidersHorizontal },
      { to: '/settings/tampilan', label: (c) => c.nav.appearance, icon: Palette },
      { to: '/settings/data', label: (c) => c.nav.data, icon: Database },
      { to: '/settings/tentang', label: (c) => c.nav.about, icon: Info },
    ],
  },
]

export const SETTINGS_ITEMS: SettingsNavItem[] = SETTINGS_NAV.flatMap((g) => g.items)

/** The item a path belongs to — the breadcrumb's last crumb, when there is one. */
export function settingsItemFor(pathname: string): SettingsNavItem | undefined {
  return SETTINGS_ITEMS.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
}
