import { auth } from './areas/auth/id'
import { cards } from './areas/cards/id'
import { categories } from './areas/categories/id'
import { domains } from './areas/domains/id'
import { home } from './areas/home/id'
import { notes } from './areas/notes/id'
import { review } from './areas/review/id'
import { settings } from './areas/settings/id'
import { timer } from './areas/timer/id'
import type { Copy } from './types'

/**
 * Bahasa Indonesia — the original copy, and the fallback.
 *
 * English is translated from this file, not written alongside it. When a string
 * changes, it changes here first and `en.ts` follows; the reverse produces two
 * catalogs that drift apart while both still typecheck.
 *
 * Every rule in `types.ts` applies: plain, direct, active voice, sentence case,
 * no filler, and never punitive.
 */

export const id: Copy = {
  common: {
    working: 'Sebentar…',
    today: 'Hari ini',
    yesterday: 'Kemarin',
  },

  auth,
  cards,
  categories,
  domains,
  home,
  notes,
  review,
  settings,
  timer,
}
