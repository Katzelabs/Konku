import { pluralFor } from '../../plural'
import type { NotesCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const notes: NotesCopy = {
  untitled: 'Tanpa judul',

  index: {
    title: 'Catatan',
    description: 'Tulis dulu, rapikan nanti.',
    count: (count) => n(count, { other: '# catatan' }),
    loadMore: (remaining) =>
      n(remaining, { other: 'Muat lebih banyak (# catatan lagi)' }),
    newNote: 'Catatan baru',
    openDeleted: 'Terhapus',
    search: {
      placeholder: 'Cari judul…',
      label: 'Cari catatan',
    },
    pickOne: 'Pilih catatan untuk membacanya di sini.',
    empty: {
      title: 'Belum ada catatan.',
      description: 'Mulai dari satu baris saja.',
    },
    noMatch: 'Tidak ada judul yang cocok.',
    select: (title) => `Pilih ${title}`,
  },

  deleted: {
    title: 'Terhapus',
    description: (days) =>
      `Catatan yang kamu hapus. Bisa dikembalikan selama ${n(days, {
        other: '# hari',
      })}, setelah itu hilang permanen.`,
    back: 'Kembali ke catatan',
    empty: {
      title: 'Tidak ada catatan terhapus.',
      description: 'Catatan yang kamu hapus akan muncul di sini.',
    },
    restore: 'Kembalikan',
    restoring: 'Mengembalikan…',
  },

  undo: {
    moved: (count) => n(count, { other: '# catatan dipindahkan ke Terhapus.' }),
    action: 'Urungkan',
  },

  delete: {
    action: 'Hapus',
    titleOne: 'Hapus catatan ini?',
    titleMany: (count) => n(count, { other: 'Hapus # catatan?' }),
    description: (days) =>
      `Catatan pindah ke Terhapus beserta kategorinya, dan bisa dikembalikan selama ${n(
        days,
        { other: '# hari' },
      )}.`,
  },

  peek: {
    fallbackTitle: 'Catatan',
    emptyBody: 'Catatan ini masih kosong.',
    edit: 'Ubah catatan',
  },

  editor: {
    back: 'Catatan',
    save: 'Simpan',
    domain: 'Domain',
    category: 'Kategori',
    title: {
      label: 'Judul catatan',
      placeholder: 'Judul',
    },
    body: {
      label: 'Isi catatan',
      placeholder: 'Tulis di sini…',
    },
    mode: {
      write: 'Tulis',
      split: 'Terpisah',
      preview: 'Pratinjau',
    },
    previewEmpty: 'Pratinjau muncul di sini.',
    delete: 'Hapus catatan',
    status: {
      retrying: 'Belum tersimpan, mencoba lagi…',
      saving: 'Menyimpan…',
      unsaved: 'Belum tersimpan',
      saved: 'Tersimpan',
    },
  },
}
