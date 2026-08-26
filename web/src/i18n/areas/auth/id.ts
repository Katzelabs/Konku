import { pluralFor } from '../../plural'
import type { AuthCopy } from './types'

const n = pluralFor('id')

/** Bahasa Indonesia — the original. Every key starts life here. */
export const auth: AuthCopy = {
  legal: {
    privacy: 'Kebijakan Privasi',
    terms: 'Ketentuan Layanan',
  },

  emailPlaceholder: 'nama@email.com',

  password: {
    hint: (min) =>
      n(min, {
        other: 'Minimal # karakter. Kalimat yang panjang lebih aman dan lebih mudah diingat.',
      }),
    confirmPlaceholder: 'Ketik lagi kata sandi di atas',
  },

  login: {
    subtitle: 'Masuk untuk melanjutkan.',
    email: 'Email',
    password: 'Kata sandi',
    submit: 'Masuk',
    submitting: 'Sebentar…',
    forgot: 'Lupa kata sandi?',
    noAccount: 'Belum punya akun?',
    createAccount: 'Buat akun',
  },

  signup: {
    title: 'Buat akun',
    subtitle: 'Mulai simpan apa yang kamu pelajari.',
    firstName: 'Nama depan',
    firstNamePlaceholder: 'Sena',
    lastName: 'Nama belakang',
    lastNamePlaceholder: 'Opsional',
    email: 'Email',
    password: 'Kata sandi',
    confirmPassword: 'Ulangi kata sandi',
    submit: 'Buat akun',
    submitting: 'Sebentar…',
    haveAccount: 'Sudah punya akun?',
    signIn: 'Masuk',
  },

  checkMail: {
    title: 'Cek email kamu',
    subtitle: 'Tinggal satu langkah lagi.',
    sentTo: (email) =>
      `Kami sudah mengirim tautan verifikasi ke *${email}*. Buka tautannya untuk mengaktifkan akun kamu.`,
    expiry: 'Tautannya berlaku 24 jam. Kalau belum masuk juga, cek folder spam dulu ya.',
    resent: 'Tautan baru sudah dikirim kalau akunnya memang belum terverifikasi.',
    resend: 'Kirim ulang tautan',
    resending: 'Mengirim…',
    resendIn: (seconds) => n(seconds, { other: 'Kirim ulang dalam # detik' }),
    resendWaitAnnounce: (seconds) => n(seconds, { other: 'Bisa kirim ulang dalam # detik.' }),
    resendReadyAnnounce: 'Sekarang bisa kirim ulang tautan.',
    signOut: 'Keluar',
    backToLogin: 'Kembali ke halaman masuk',
  },

  forgot: {
    title: 'Lupa kata sandi',
    subtitle: 'Kami kirimkan tautan untuk membuat kata sandi baru.',
    email: 'Email',
    emailHint: 'Alamat yang kamu pakai waktu mendaftar.',
    submit: 'Kirim tautan',
    submitting: 'Mengirim…',
    rememberedIt: 'Ingat kata sandinya?',
    signIn: 'Masuk',
    sent: {
      title: 'Cek email kamu',
      body: (email) =>
        `Kalau *${email}* terdaftar, kami sudah mengirim tautan untuk mengatur ulang kata sandi ke sana.`,
      expiry: 'Tautannya berlaku 1 jam. Kalau belum masuk juga, cek folder spam.',
      backToLogin: 'Kembali ke halaman masuk',
    },
  },

  reset: {
    title: 'Buat kata sandi baru',
    password: 'Kata sandi baru',
    confirmPassword: 'Ulangi kata sandi baru',
    submit: 'Simpan kata sandi',
    submitting: 'Menyimpan…',
    done: {
      title: 'Kata sandi diperbarui',
      body: 'Kata sandi kamu sudah diganti. Semua perangkat yang tadinya masuk sudah dikeluarkan, jadi silakan masuk lagi dengan kata sandi yang baru.',
      signIn: 'Masuk',
    },
    failed: {
      title: 'Tautan tidak berlaku',
      incompleteLink: 'Tautan ini tidak lengkap. Buka tautan dari email kamu ya.',
      requestNew: 'Minta tautan baru',
    },
  },

  verify: {
    loading: 'Memuat…',
    pending: 'Memverifikasi…',
    done: {
      title: 'Email terverifikasi',
      subtitle: 'Akun kamu sudah aktif.',
      body: 'Terima kasih. Sekarang kamu bisa masuk dan mulai menulis.',
      signIn: 'Masuk',
    },
    failed: {
      title: 'Tautan tidak berlaku',
      incompleteLink: 'Tautan ini tidak lengkap. Buka tautan dari email kamu ya.',
      help: 'Masuk dengan akun kamu untuk meminta tautan baru.',
      signIn: 'Ke halaman masuk',
    },
  },

  validation: {
    emailRequired: 'Email wajib diisi.',
    emailFormat: 'Format email belum benar. Contoh: nama@email.com',
    passwordRequired: 'Kata sandi wajib diisi.',
    passwordMin: (min) => n(min, { other: 'Kata sandi minimal # karakter.' }),
    nameMax: (max) => n(max, { other: 'Maksimal # karakter.' }),
    nameControlChars: 'Nama tidak boleh berisi karakter aneh.',
    firstNameRequired: 'Nama depan wajib diisi.',
    confirmRequired: 'Ulangi kata sandi kamu.',
    confirmMismatch: 'Kata sandinya belum sama.',
    currentPasswordRequired: 'Kata sandi saat ini wajib diisi.',
    passwordUnchanged: 'Kata sandi baru masih sama dengan yang lama.',
  },
}
