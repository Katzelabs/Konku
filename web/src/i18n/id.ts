import { auth } from './areas/auth/id'
import { cards } from './areas/cards/id'
import { categories } from './areas/categories/id'
import { domains } from './areas/domains/id'
import { home } from './areas/home/id'
import { notes } from './areas/notes/id'
import { review } from './areas/review/id'
import { settings } from './areas/settings/id'
import { timer } from './areas/timer/id'
import { pluralFor } from './plural'
import type { Copy } from './types'

/**
 * The one counted string `common` has. Indonesian writes one form, so the
 * machinery is here only to format the number: 5.000, not 5000, and the notes
 * quota is 5.000 rows (07 L8).
 */
const n = pluralFor('id')

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
    loading: 'Memuat…',
    cancel: 'Batal',
    close: 'Tutup',
    today: 'Hari ini',
    yesterday: 'Kemarin',

    password: {
      show: 'Tampilkan kata sandi',
      hide: 'Sembunyikan kata sandi',
    },

    selection: {
      count: (count) => n(count, { other: '# dipilih' }),
      selectAll: 'Pilih semua',
      selectAllLoaded: 'Pilih semua yang tampil',
      clear: 'Batalkan pilih semua',
    },

    filter: {
      searchDomains: 'Cari domain…',
      searchCategories: 'Cari kategori…',
      noMatch: 'Tidak ada yang cocok.',
      clearSelection: 'Hapus pilihan',
    },

    view: {
      label: 'Tampilan',
      list: 'Tampilan daftar',
      grid: 'Tampilan kisi',
    },

    color: {
      label: 'Warna',
      swatch: (hex) => `Warna ${hex}`,
      hex: 'Kode warna',
    },

    picker: {
      domain: {
        placeholder: 'Pilih domain',
        none: 'Tanpa domain',
      },
      category: {
        add: 'Tambah kategori',
        search: 'Cari atau tambah kategori…',
        create: (query) => `Tambah “${query}”`,
        empty: 'Belum ada kategori. Ketik untuk membuat satu.',
        done: 'Selesai',
        remove: (label) => `Hapus kategori ${label}`,
      },
    },

    flashcard: {
      showSide: (side) => `Lihat ${side.toLowerCase()}`,
      side: (side) => `Sisi kartu: ${side}`,
    },

    peek: {
      close: 'Tutup pratinjau',
    },

    nav: {
      skipToContent: 'Lewati ke konten',
      breadcrumb: 'Jejak navigasi',
      openSidebar: 'Buka sidebar',
      closeSidebar: 'Tutup sidebar',
      reviewToday: 'Hari ini',
      searchNotes: {
        placeholder: 'Cari judul catatan…',
        label: 'Cari judul catatan',
      },
      account: 'Akun',
      signOut: 'Keluar',
      openTimer: 'Buka timer',
      focus: 'Fokus',
    },

    error: {
      crash:
        'Bagian ini gagal ditampilkan. Laporannya sudah dikirim otomatis, jadi kamu tidak perlu melaporkannya.',
      reload: 'Muat ulang halaman',
      unreachable: 'Tidak bisa menghubungi server. Coba muat ulang halaman.',
    },
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
