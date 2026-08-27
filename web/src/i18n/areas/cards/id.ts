import { pluralFor } from '../../plural'
import type { CardsCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const cards: CardsCopy = {
  index: {
    title: 'Kartu',
    description: 'Satu pertanyaan, satu jawaban. Ditulis di sini, diulang di layar ulangan.',
    count: (count) => n(count, { other: '# kartu' }),
    loadMore: (remaining) =>
      n(remaining, { other: 'Muat lebih banyak (# kartu lagi)' }),
    startReview: 'Mulai ulangan',
    newCard: 'Kartu baru',
    search: {
      placeholder: 'Cari isi kartu…',
      label: 'Cari kartu',
    },
    selectCard: 'Pilih kartu ini',
    placeholder: 'Pilih kartu untuk melihat isinya.',
    empty: {
      title: 'Belum ada kartu.',
      description: 'Satu pertanyaan yang ingin kamu ingat sudah cukup untuk mulai.',
    },
    noMatch: 'Tidak ada kartu yang cocok.',
    delete: 'Hapus',
  },

  deleted: {
    title: 'Terhapus',
    description:
      'Kartu yang kamu hapus. Dikembalikan lengkap dengan riwayat ulangannya. Kartu yang belum pernah diulang hilang permanen setelah 30 hari.',
    back: 'Kembali ke kartu',
    empty: {
      title: 'Tidak ada kartu terhapus.',
      description: 'Kartu yang kamu hapus akan muncul di sini.',
    },
    undo: {
      moved: (count) => n(count, { other: '# kartu dipindahkan ke Terhapus.' }),
      action: 'Urungkan',
    },
    restore: 'Kembalikan',
    restoring: 'Mengembalikan…',
  },

  confirmDelete: {
    one: 'Hapus kartu ini?',
    many: (count) => n(count, { other: 'Hapus # kartu?' }),
    description:
      'Kartu pindah ke Terhapus. Jadwal dan riwayat ulangannya tetap utuh. Kartu yang pernah kamu ulang bisa dikembalikan kapan saja; yang belum pernah, selama 30 hari.',
    confirm: 'Hapus',
  },

  peek: {
    title: 'Kartu',
    edit: 'Ubah kartu',
    delete: 'Hapus',
  },

  editor: {
    save: 'Simpan',
    saving: 'Menyimpan…',
    unsaved: 'Belum tersimpan',
    front: {
      label: 'Pertanyaan',
      placeholder: 'Apa itu prior?',
    },
    back: {
      label: 'Jawaban',
      placeholder: 'Keyakinan awal sebelum melihat data.',
    },
    markdownHint: 'Kedua sisi mendukung markdown, termasuk beberapa baris dan blok kode.',
    delete: 'Hapus kartu',
  },
}
