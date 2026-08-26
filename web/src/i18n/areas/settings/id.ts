import { pluralFor } from '../../plural'
import type { SettingsCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const settings: SettingsCopy = {
  language: {
    title: 'Bahasa',
    description: 'Tersimpan di akun, jadi ikut ke perangkat lain.',
    auto: 'Ikut peramban',
  },

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
}
