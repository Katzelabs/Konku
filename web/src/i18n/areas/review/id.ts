import { pluralFor } from '../../plural'
import type { ReviewCopy } from './types'

const n = pluralFor('id')

/**
 * Two numbers in one sentence cannot both be `#`, so those go through
 * `Intl.NumberFormat` directly. Never a raw `${value}`: Indonesian writes
 * 5.000 where English writes 5,000, and this feature counts things.
 */
const num = new Intl.NumberFormat('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const review: ReviewCopy = {
  title: 'Ulangan',
  description:
    'Kartu yang jadwalnya jatuh hari ini, plus latihan yang kamu susun sendiri.',

  due: {
    title: 'Ulangan hari ini',
    none: 'Tidak ada yang perlu diulang hari ini.',
    ready: (count) => n(count, { other: '# kartu siap diulang.' }),
    restTomorrow: 'Sisanya besok.',
    start: 'Mulai',
    done: 'Selesai untuk hari ini.',
    toNotes: 'Ke catatan',
  },

  answering: {
    position: (current, total) => `${num.format(current)} dari ${num.format(total)}`,
    reveal: 'Tampilkan jawaban',
    revealing: 'Membuka…',
    notYet: 'Belum ingat',
    remembered: 'Ingat',
    editCard: 'Ubah kartu ini',
  },

  sets: {
    title: 'Latihan',
    description:
      'Susun sendiri: berapa soal, domain dan kategori mana, mau bentuk pilihan ganda atau ingat sendiri. Hasilnya tidak mengubah jadwal di atas.',
    create: 'Buat latihan',
    empty: {
      title: 'Belum ada latihan tersimpan.',
      description:
        'Buat satu kalau mau menguji diri di luar jadwal, atau fokus ke satu topik saja.',
    },
    noun: 'latihan',
  },

  summary: {
    randomQuestions: (count) => n(count, { other: '# soal acak' }),
    fixedQuestions: 'soal tetap',
    choice: 'pilihan ganda',
    recall: 'ingat sendiri',
    runCount: (count) => n(count, { other: '#× dikerjakan' }),
  },

  newSet: {
    titleLabel: 'Judul latihan',
    titlePlaceholder: 'Latihan aljabar linear',
    formatLegend: 'Bentuk soal',
    recallOption: 'Ingat sendiri — lihat soal, ingat-ingat, baru buka jawabannya',
    choiceOption: 'Pilihan ganda — empat pilihan, dinilai otomatis',
    choiceNote:
      'Pilihan salahnya diambil dari jawaban kartu kamu yang lain. Mengenali jawaban lebih gampang daripada mengingatnya, jadi angkanya wajar lebih tinggi.',
    domainLegend: 'Domain',
    domainHint: 'Kosongkan kalau mau dari semua.',
    categoryLegend: 'Kategori',
    categoryHint: 'Digabung dengan domain: kartu harus cocok keduanya.',
    selectionLegend: 'Soal',
    randomOption: 'Acak tiap kali dikerjakan',
    fixedOption: 'Tetap — soalnya sama tiap kali, jadi skornya bisa dibandingkan',
    countLabel: 'Jumlah soal',
    fixedHint: 'Setelah disimpan, pilih kartunya di halaman latihan ini.',
    save: 'Simpan',
    cancel: 'Batal',
  },

  set: {
    back: 'Semua ulangan',
    start: 'Mulai',
    resume: 'Lanjutkan',
    openRun: 'Ada percobaan yang belum selesai.',
    archive: 'Arsipkan',
    delete: 'Hapus',
    picker: {
      loading: 'Memuat kartu…',
      title: 'Soal',
      chosen: (chosen, total) =>
        `${num.format(chosen)} dipilih dari ${num.format(total)}`,
      empty: 'Belum ada kartu yang bisa dipilih. Buat beberapa kartu dulu.',
      save: 'Simpan daftar soal',
      noun: 'kartu',
    },
    history: {
      title: 'Riwayat',
      empty: 'Belum pernah dikerjakan.',
      noun: 'percobaan',
    },
  },

  run: {
    finished: {
      title: 'Selesai menjawab',
      description: 'Semua soal sudah dijawab.',
      action: 'Lihat hasil',
    },
    position: (current, total) =>
      `Soal ${num.format(current)} dari ${num.format(total)}`,
    missingCard: 'Kartu ini sudah tidak ada.',
    skip: 'Lewati',
    correct: 'Betul.',
    incorrect: 'Belum kena — jawabannya yang ditandai.',
    next: 'Lanjut',
    result: {
      title: 'Hasil',
      noScheduleChange: 'Ini tidak mengubah jadwal ulangan kartu-kartu ini.',
      missedTitle: 'Yang belum nempel',
      back: 'Kembali ke latihan',
    },
  },
}
