import { pluralFor } from '../../plural'
import type { CategoriesCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const categories: CategoriesCopy = {
  title: 'Kategori',
  description:
    'Satu kosakata yang dipakai bersama oleh catatan dan kartu. Biasanya kamu bikin langsung sambil nulis — di sini tempatnya kalau mau dirapikan.',

  noun: 'Kategori',

  add: 'Tambah',

  empty: {
    title: 'Belum ada kategori.',
    description: 'Kategori muncul di sini begitu kamu menambahkannya di catatan atau kartu.',
  },

  archivedHeading: 'Diarsipkan',

  form: {
    label: 'Nama kategori',
    placeholder: 'Aljabar linear',
    save: 'Simpan',
    cancel: 'Batal',
    renameNote: 'Ganti nama berlaku di semua catatan dan kartu yang memakainya.',
  },

  row: {
    used: (notes, cards) =>
      `${n(notes, { other: '# catatan' })} · ${n(cards, { other: '# kartu' })}`,
    unused: 'belum dipakai',
    edit: 'Ubah',
    archive: 'Arsipkan',
    unarchive: 'Aktifkan lagi',
    delete: 'Hapus',
  },
}
