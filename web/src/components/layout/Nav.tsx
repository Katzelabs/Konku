import {
  Clock,
  FileText,
  Home,
  Layers,
  Repeat,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { copyFor, DEFAULT_LOCALE, type Copy } from '../../i18n'
import { settingsItemFor } from '../../features/settings/nav'

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
  /**
   * Paths that belong to this destination without living under its URL.
   *
   * Pengaturan is the only one: `/domains` and `/categories` are settings
   * screens, they render inside the settings shell, and they kept their own
   * top-level URLs — so without this the sidebar goes blank the moment you
   * open one from the rail.
   */
  alsoActiveOn?: RegExp
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
  {
    to: '/settings',
    label: 'Pengaturan',
    icon: Settings,
    alsoActiveOn: /^\/(domains|categories)/,
  },
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
  {
    match: /^\/categories/,
    crumbs: [{ label: 'Pengaturan', to: '/settings' }, { label: 'Kategori' }],
  },
  { match: /^\/settings/, crumbs: [{ label: 'Pengaturan' }] },
]

/**
 * The trail for a path.
 *
 * Settings sections are not in the table: they are a list that grows, and a
 * second copy of it here would drift from `features/settings/nav.ts` the first
 * time one is renamed. The section name comes from that list instead, appended
 * to the Pengaturan crumb the table already supplies. Domain and Kategori are
 * still spelled out above because their URLs are not under `/settings`.
 *
 * `copy` is what resolves that section name, because a settings nav label is a
 * catalog entry now (ticket 11 I5). It is defaulted rather than required: this
 * file's own crumbs are still Indonesian literals awaiting their own slice, so
 * a caller that has not got a catalog is no worse off than it was, and a
 * caller that has gets the one crumb that is already translated.
 */
export function crumbsFor(
  pathname: string,
  copy: Copy = copyFor(DEFAULT_LOCALE),
): Crumb[] {
  const crumbs = TRAIL.find((t) => t.match.test(pathname))?.crumbs ?? []
  if (!pathname.startsWith('/settings/')) return crumbs

  const section = settingsItemFor(pathname)
  if (!section) return crumbs
  return [
    { label: 'Pengaturan', to: '/settings' },
    { label: section.label(copy.settings) },
  ]
}
