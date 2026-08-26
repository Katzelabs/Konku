import { pluralFor } from './plural'
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

/** Indonesian has one plural form. The helper still formats the number. */
const n = pluralFor('id')

export const id: Copy = {
  common: {
    working: 'Sebentar…',
  },

  settings: {
    sessions: {
      title: 'Perangkat yang masuk',
      description: 'Tempat akun ini sedang dipakai. Akhiri yang tidak kamu kenali.',
      currentDevice: '(perangkat ini)',
      unknownDevice: 'Perangkat tidak dikenal',
      unknownAddress: 'alamat tidak diketahui',
      clientOn: (browser, platform) => `${browser} di ${platform}`,
      lastActive: (relative) => `aktif ${relative}`,
      signOutCurrent: 'Keluar',
      endSession: 'Akhiri',
      signOutOthers: {
        title: 'Keluar dari perangkat lain',
        description: 'Sesi di perangkat ini tetap aktif.',
        action: 'Keluarkan',
      },
      ago: {
        justNow: 'baru saja',
        minutes: (count) => n(count, { other: '# menit lalu' }),
        hours: (count) => n(count, { other: '# jam lalu' }),
        yesterday: 'kemarin',
        days: (count) => n(count, { other: '# hari lalu' }),
        overAMonth: 'lebih dari sebulan lalu',
      },
    },
  },
}
