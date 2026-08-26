import { pluralFor } from '../../plural'
import type { DomainsCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const domains: DomainsCopy = {
  title: 'Domain',
  description:
    'Domain menandai catatan dan sesi fokus, dan jadi dasar rotasi mingguan. Target mingguan cuma penanda arah, bukan setoran — nol berarti domain tetap bisa dipakai tapi tidak ikut rotasi.',

  noun: 'Domain',

  add: 'Tambah',

  empty: {
    title: 'Belum ada domain.',
    description: 'Domain dipakai buat menandai catatan dan sesi fokus.',
  },

  archivedHeading: 'Diarsipkan',

  form: {
    label: 'Nama domain',
    placeholder: 'Pengetahuan umum',
    quota: 'Target mingguan',
    save: 'Simpan',
    cancel: 'Batal',
  },

  row: {
    perWeek: (count) => n(count, { other: '#× / minggu' }),
    outOfRotation: 'di luar rotasi',
    edit: 'Ubah',
    archive: 'Arsipkan',
    unarchive: 'Aktifkan lagi',
    delete: 'Hapus',
  },
}
