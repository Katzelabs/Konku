import {
  Database,
  Info,
  MonitorSmartphone,
  Palette,
  Shapes,
  Tags,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
 */
export interface SettingsNavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface SettingsNavGroup {
  label: string
  items: SettingsNavItem[]
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'Akun',
    items: [
      { to: '/settings/akun', label: 'Profil', icon: UserRound },
      { to: '/settings/perangkat', label: 'Perangkat', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'Label',
    items: [
      { to: '/domains', label: 'Domain', icon: Tags },
      { to: '/categories', label: 'Kategori', icon: Shapes },
    ],
  },
  {
    label: 'Aplikasi',
    items: [
      { to: '/settings/tampilan', label: 'Tampilan', icon: Palette },
      { to: '/settings/data', label: 'Data & privasi', icon: Database },
      { to: '/settings/tentang', label: 'Tentang', icon: Info },
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
