import { pluralFor } from '../../plural'
import type { HomeCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const home: HomeCopy = {
  title: 'Beranda',
  description: 'Mulai dari sini. Tidak ada target harian — cukup lanjutkan yang kemarin.',

  due: {
    title: 'Ulangan hari ini',
    cardsUnit: (count) => n(count, { other: 'kartu' }),
    none: 'Tidak ada yang perlu diulang hari ini.',
    deferred: 'Sisanya besok.',
    allToday: 'Semuanya muat hari ini.',
    action: 'Mulai ulangan',
  },

  focus: {
    title: 'Sesi fokus',
    description: 'Mulai pendek. Selesai sesi, kamu ditanya apa yang barusan dipelajari.',
    action: 'Buka timer',
  },

  capture: {
    title: 'Catatan baru',
    description: 'Satu baris sudah cukup untuk mulai.',
    action: 'Tulis catatan',
  },

  recent: {
    title: 'Catatan terakhir',
    all: 'Semua catatan',
    empty: {
      title: 'Belum ada catatan.',
      description: 'Mulai dari satu baris saja.',
    },
    untitled: 'Tanpa judul',
  },

  domains: {
    title: 'Domain',
    manage: 'Atur',
    empty: 'Belum ada domain.',
    weekly: (count) => n(count, { other: '#×/minggu' }),
    outOfRotation: 'di luar rotasi',
  },
}
