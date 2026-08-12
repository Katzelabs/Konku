import {
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
 */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Matched exactly rather than as a prefix. */
  end?: boolean
  /** Show the due-card count beside this item. */
  showsDue?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/home', label: 'Beranda', icon: Home, end: true },
  { to: '/notes', label: 'Catatan', icon: FileText },
  { to: '/cards', label: 'Kartu', icon: Layers },
  // One entry, not two. Ujian used to sit here as a sibling; it was the same
  // feature with a different name, and it now lives inside Ulangan (D-075).
  { to: '/review', label: 'Ulangan', icon: Repeat, showsDue: true },
  { to: '/timer', label: 'Timer', icon: Clock },
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/settings', label: 'Pengaturan', icon: Settings },
]

export interface Crumb {
  label: string
  /** Absent on the last crumb — you are already there. */
  to?: string
}

/**
 * The breadcrumb trail for a path.
 *
 * A flat table rather than something derived from the URL segments: Domain
 * lives under Pengaturan in the trail but at `/domains` in the router.
 * Deriving from segments would get that wrong, and would also spell a run's
 * trail as Ulangan / Sets / Runs.
 *
 * Order matters — the first match wins, so the deeper patterns come first.
 */
const TRAIL: { match: RegExp; crumbs: Crumb[] }[] = [
  { match: /^\/home/, crumbs: [{ label: 'Beranda' }] },
  { match: /^\/notes\/.+/, crumbs: [{ label: 'Catatan', to: '/notes' }] },
  { match: /^\/notes/, crumbs: [{ label: 'Catatan' }] },
  { match: /^\/cards/, crumbs: [{ label: 'Kartu' }] },
  { match: /^\/review\/due/, crumbs: [{ label: 'Ulangan', to: '/review' }, { label: 'Hari ini' }] },
  { match: /^\/review\/sets/, crumbs: [{ label: 'Ulangan', to: '/review' }, { label: 'Latihan' }] },
  { match: /^\/review\/runs/, crumbs: [{ label: 'Ulangan', to: '/review' }, { label: 'Latihan' }] },
  { match: /^\/review/, crumbs: [{ label: 'Ulangan' }] },
  { match: /^\/timer/, crumbs: [{ label: 'Timer' }] },
  {
    match: /^\/domains/,
    crumbs: [{ label: 'Pengaturan', to: '/settings' }, { label: 'Domain' }],
  },
  { match: /^\/settings/, crumbs: [{ label: 'Pengaturan' }] },
]

export function crumbsFor(pathname: string): Crumb[] {
  return TRAIL.find((t) => t.match.test(pathname))?.crumbs ?? []
}
