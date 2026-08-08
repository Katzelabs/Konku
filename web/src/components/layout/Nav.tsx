import {
  ClipboardList,
  Clock,
  FileText,
  Home,
  Layers,
  Repeat,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The destinations, in one place so the sidebar, the mobile bar and the
 * breadcrumbs cannot drift apart.
 *
 * "Kartu" is a browser over cards that already exist in notes — where each one
 * came from, filtered by domain. It is not a deck manager: there is no import,
 * no cover art, no mastery percentage, and no way to create a card outside a
 * note (D-054).
 *
 * Domain management moved into Pengaturan. It is settings-shaped rather than
 * somewhere you go daily.
 */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Matched as a prefix for breadcrumbs and active state on child routes. */
  end?: boolean
  /** Show the due-card count beside this item. */
  showsDue?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/home', label: 'Beranda', icon: Home, end: true },
  { to: '/notes', label: 'Catatan', icon: FileText },
  { to: '/cards', label: 'Kartu', icon: Layers },
  { to: '/review', label: 'Ulangan', icon: Repeat, showsDue: true },
  { to: '/timer', label: 'Fokus', icon: Clock },
  { to: '/exams', label: 'Ujian', icon: ClipboardList },
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/settings', label: 'Pengaturan', icon: Settings },
]

const ALL = [...PRIMARY_NAV, ...SECONDARY_NAV]

/** The label for the current path, for breadcrumbs. */
export function navLabelFor(pathname: string): string | null {
  const match = ALL.filter((i) => pathname.startsWith(i.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0]
  return match?.label ?? null
}
