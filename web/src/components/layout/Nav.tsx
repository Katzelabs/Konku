import {
  Clock,
  FileText,
  Home,
  Layers,
  Repeat,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Copy } from '../../i18n'
import { settingsItemFor } from '../../features/settings/nav'

/**
 * The destinations, in one place so the sidebar, the mobile bar and the
 * breadcrumbs cannot drift apart.
 *
 * "Kartu" is a browser over cards that already exist in notes — where each one
 * came from, filtered by domain. It is not a deck manager: there is no import,
 * no cover art, no mastery percentage, and no way to create a card outside a
 * note (D-054).
 *
 * ── A label is copy, and this is a data file (ticket 11 I5) ─────────────────
 *
 * So the words left, exactly as they did in `features/settings/nav.ts`, and
 * for the same reasons: this module is a plain constant read at import time by
 * the sidebar, the phone bar and the breadcrumb trail, and a hook returning
 * the built list would not work for `crumbsFor`, which is not a component.
 * A label is a *selector* over `Copy` now, so every reader resolves the word
 * against the locale it is rendering in.
 *
 * **None of the six destination names is written here.** Each is read across
 * from the area that owns the screen it opens — `notes.index.title` names
 * `/notes`, and so on down — so the nav and the page it lands on cannot come
 * to disagree about what the page is called. `common.nav` holds only what the
 * shell says and no feature does.
 */
export interface NavItem {
  to: string
  /** The word for this destination, resolved against a catalog. */
  label: (c: Copy) => string
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
  { to: '/home', label: (c) => c.home.title, icon: Home, end: true },
  { to: '/notes', label: (c) => c.notes.index.title, icon: FileText },
  { to: '/cards', label: (c) => c.cards.index.title, icon: Layers },
  // One entry, not two. Ujian used to sit here as a sibling; it was the same
  // feature with a different name, and it now lives inside Ulangan (D-075).
  { to: '/review', label: (c) => c.review.title, icon: Repeat, showsDue: true },
  { to: '/timer', label: (c) => c.timer.title, icon: Clock },
]

export const SECONDARY_NAV: NavItem[] = [
  {
    to: '/settings',
    label: (c) => c.settings.shell.title,
    icon: Settings,
    alsoActiveOn: /^\/(domains|categories)/,
  },
]

export interface Crumb {
  label: string
  /** Absent on the last crumb — you are already there. */
  to?: string
}

/** A trail entry before a catalog has been applied to it. */
interface CrumbSpec {
  label: (c: Copy) => string
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
const TRAIL: { match: RegExp; crumbs: CrumbSpec[] }[] = [
  { match: /^\/home/, crumbs: [{ label: (c) => c.home.title }] },
  {
    match: /^\/notes\/.+/,
    crumbs: [{ label: (c) => c.notes.index.title, to: '/notes' }],
  },
  { match: /^\/notes/, crumbs: [{ label: (c) => c.notes.index.title }] },
  { match: /^\/cards/, crumbs: [{ label: (c) => c.cards.index.title }] },
  {
    match: /^\/review\/due/,
    crumbs: [
      { label: (c) => c.review.title, to: '/review' },
      // Not `review.due.title`: the crumb above already says Ulangan, and
      // "Ulangan / Ulangan hari ini" is the trail stuttering. This is the one
      // destination name the shell owns, which is why `common.nav` holds it.
      { label: (c) => c.common.nav.reviewToday },
    ],
  },
  {
    match: /^\/review\/sets/,
    crumbs: [
      { label: (c) => c.review.title, to: '/review' },
      { label: (c) => c.review.sets.title },
    ],
  },
  {
    match: /^\/review\/runs/,
    crumbs: [
      { label: (c) => c.review.title, to: '/review' },
      { label: (c) => c.review.sets.title },
    ],
  },
  { match: /^\/review/, crumbs: [{ label: (c) => c.review.title }] },
  { match: /^\/timer/, crumbs: [{ label: (c) => c.timer.title }] },
  {
    // Domain and Kategori are the *settings rail's* words for these two, which
    // is what the trail is spelling out — they sit under Pengaturan here and
    // at their own top-level URLs in the router (D-079).
    match: /^\/domains/,
    crumbs: [
      { label: (c) => c.settings.shell.title, to: '/settings' },
      { label: (c) => c.settings.nav.domains },
    ],
  },
  {
    match: /^\/categories/,
    crumbs: [
      { label: (c) => c.settings.shell.title, to: '/settings' },
      { label: (c) => c.settings.nav.categories },
    ],
  },
  { match: /^\/settings/, crumbs: [{ label: (c) => c.settings.shell.title }] },
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
 * `copy` resolves every label, and it is **required**. It was defaulted while
 * this file still held Indonesian literals, so that a caller with no catalog
 * compiled and got the one crumb that was already translated. Every crumb is a
 * catalog entry now, so a default would only be a way to render the whole
 * trail in the wrong language without anything noticing (ticket 11 I5).
 */
export function crumbsFor(pathname: string, copy: Copy): Crumb[] {
  const specs = TRAIL.find((t) => t.match.test(pathname))?.crumbs ?? []
  const crumbs = specs.map((s) => ({ label: s.label(copy), to: s.to }))
  if (!pathname.startsWith('/settings/')) return crumbs

  const section = settingsItemFor(pathname)
  if (!section) return crumbs
  return [
    { label: copy.settings.shell.title, to: '/settings' },
    { label: section.label(copy.settings) },
  ]
}
