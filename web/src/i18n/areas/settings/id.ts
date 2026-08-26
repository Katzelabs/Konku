import { pluralFor } from '../../plural'
import type { SettingsCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const settings: SettingsCopy = {
  shell: {
    title: 'Pengaturan',
    description: 'Akun, label, tampilan, dan datamu.',
    navLabel: 'Bagian pengaturan',
  },

  nav: {
    groups: {
      account: 'Akun',
      labels: 'Label',
      app: 'Aplikasi',
    },
    profile: 'Profil',
    devices: 'Perangkat',
    domains: 'Domain',
    categories: 'Kategori',
    preferences: 'Preferensi',
    appearance: 'Tampilan',
    data: 'Data & privasi',
    about: 'Tentang',
  },

  field: {
    empty: 'Belum diisi',
  },

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

  cancel: 'Batal',

  account: {
    title: 'Profil',
    description: 'Akun ini dan kata sandinya. Nama dan email belum bisa diubah dari sini.',
    emailVerified: 'Email terverifikasi',
    emailUnverified: 'Email belum diverifikasi',
    nameLabel: 'Nama',
    emailLabel: 'Email',
    signOut: {
      title: 'Keluar dari perangkat ini',
      description:
        'Sesi di perangkat ini diakhiri. Perangkat lain tetap masuk, dan kamu bisa masuk lagi kapan saja.',
      action: 'Keluar',
    },
  },

  password: {
    title: 'Ubah kata sandi',
    rowDescription:
      'Perangkat lain yang sedang masuk akan dikeluarkan. Perangkat ini tetap masuk.',
    action: 'Ubah',
    dialogDescription:
      'Masukkan kata sandi saat ini, lalu kata sandi barunya. Setelah diganti, perangkat lain yang sedang masuk akan dikeluarkan.',
    currentLabel: 'Kata sandi saat ini',
    newLabel: 'Kata sandi baru',
    newHint: (min) =>
      n(min, { other: 'Minimal # karakter.' }) +
      ' Kalimat yang panjang lebih aman dan lebih mudah diingat.',
    confirmLabel: 'Ulangi kata sandi baru',
    confirmPlaceholder: 'Ketik lagi kata sandi di atas',
    saving: 'Menyimpan…',
    save: 'Simpan kata sandi',
  },

  appearance: {
    title: 'Tampilan',
    description:
      'Tersimpan di perangkat ini, bukan di akun. Perangkat lain tidak ikut berubah.',
    themeLabel: 'Tema',
    themes: {
      light: 'Terang',
      dark: 'Gelap',
      system: 'Ikut sistem',
    },
  },

  preferences: {
    title: 'Preferensi',
    description:
      'Tersimpan di akun, jadi ikut ke perangkat lain. Tema diatur terpisah di Tampilan karena itu milik perangkat ini.',
    focusDuration: {
      title: 'Durasi fokus default',
      description:
        'Timer terbuka dengan durasi ini. Kamu tetap bisa menggantinya sebelum memulai sesi.',
      minutes: (count) => n(count, { other: '# menit' }),
    },
    loading: 'Memuat preferensi…',
    loadError: 'Pengaturan belum bisa dimuat. Coba muat ulang halaman ini ya.',
  },

  about: {
    title: 'Tentang',
    description: 'Apa yang Konku simpan, dan dokumennya.',
    stores:
      'Konku menyimpan apa yang kamu tulis dan alamat email kamu. Tidak dijual, tidak dipakai untuk iklan, tidak dipakai melatih model AI.',
    notAggregated:
      'Riwayat belajar kamu tidak pernah digabung dengan punya orang lain — semua angka di aplikasi ini dihitung untuk akun kamu sendiri.',
    privacy: 'Kebijakan Privasi',
    terms: 'Ketentuan Layanan',
  },

  export: {
    title: 'Unduh datamu',
    description: 'Semua yang tersimpan di akun ini, dalam satu arsip.',
    formats:
      'Catatan dan kartu sebagai file markdown biasa, sisanya JSON — jadwal ulang, riwayat ulangan, sesi fokus, domain, kategori, dan latihan tersimpan.',
    portable:
      'Bisa dibuka di Obsidian atau editor teks apa pun. Tidak ada yang dikunci di format khusus.',
    row: {
      title: 'Unduh arsip',
      description: 'Kata sandi dan sesi login tidak ikut diunduh.',
    },
    action: 'Unduh',
  },

  delete: {
    title: 'Hapus akun',
    description: 'Kalau kamu mau berhenti. Unduh datanya dulu kalau perlu.',
    action: 'Hapus akun',
    rowTitle: 'Hapus akun ini secara permanen',
    rowDescription:
      'Semua catatan, kartu, dan riwayat review ikut terhapus. Tidak bisa dikembalikan.',
    dialogDescription:
      'Catatan, kartu, jadwal ulang, riwayat ulangan, sesi fokus, dan latihan kamu akan dihapus permanen. Ini tidak bisa dibatalkan.',
    exportPrompt: 'Mau simpan salinannya dulu?',
    passwordLabel: 'Masukkan kata sandi untuk mengonfirmasi',
    deleting: 'Menghapus…',
    confirm: 'Hapus akun saya',
  },
}
