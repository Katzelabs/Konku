import { Clock, FileText, GraduationCap, Layers, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The destinations, in one place so the sidebar and the mobile bar cannot
 * drift apart.
 *
 * There is no "Cards" entry. Cards live inside notes and are reviewed through
 * Ulangan — a deck browser is Anki's model, not this one (D-054). Domain is
 * settings-shaped rather than somewhere you go daily, so it sits last and
 * below the divider on desktop.
 */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Show the due-card count beside this item. */
  showsDue?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/notes', label: 'Catatan', icon: FileText },
  { to: '/review', label: 'Ulangan', icon: Layers, showsDue: true },
  { to: '/timer', label: 'Fokus', icon: Clock },
  { to: '/exams', label: 'Ujian', icon: GraduationCap },
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/domains', label: 'Domain', icon: Tag },
]
