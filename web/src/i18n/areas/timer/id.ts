import { pluralFor } from '../../plural'
import type { TimerCopy } from './types'

const n = pluralFor('id')

/**
 * A number on its own, for a sentence carrying two of them.
 *
 * `pluralFor` replaces every `#` with the one count it was given, so the
 * second number in `log.showing` has to be formatted before it goes into the
 * form string. Never interpolated raw: Indonesian writes 312 the same as
 * English but 5.000 differently, and the log has no ceiling.
 */
const num = new Intl.NumberFormat('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const timer: TimerCopy = {
  title: 'Timer',
  description:
    'Sesi dengan awal dan akhir yang jelas. Selesai sesi, kamu ditanya apa yang barusan dipelajari.',

  status: {
    idle: 'Siap',
    running: 'Berjalan',
    paused: 'Dijeda',
    done: 'Selesai',
  },

  controls: {
    start: 'Mulai',
    pause: 'Jeda',
    resume: 'Lanjut',
    reset: 'Ulangi',
  },

  duration: 'Durasi',
  durationHint: 'Mulai pendek. Durasi naik sendiri kalau sesi pendek sudah kebiasaan.',
  domain: 'Domain',
  noDomain: 'Tanpa domain',

  minutes: (count) => n(count, { other: '# menit' }),

  summary: {
    title: 'Sesi ini',
    endsAround: 'Selesai sekitar',
  },

  logFailed: 'Sesi belum tercatat.',
  retry: 'Coba lagi',

  capture: {
    title: 'Apa yang kamu pelajari?',
    description: 'Satu baris saja cukup.',
    placeholder: 'Satu baris saja cukup.',
    cardHint: 'Tulis kartu dengan format',
    cardSyntax: 'Tanya :: Jawab',
    skip: 'Lewati',
    save: 'Simpan',
    saving: 'Menyimpan…',
  },

  log: {
    title: 'Sesi terakhir',
    sessions: (count) => n(count, { other: '# sesi' }),
    empty: {
      title: 'Belum ada sesi tercatat.',
      description: 'Sesi yang selesai muncul di sini.',
    },
    showing: (shown, total) =>
      n(shown, { other: `Menampilkan # sesi terakhir dari ${num.format(total)}.` }),
  },
}
