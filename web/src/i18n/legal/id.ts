import { CONTACT_EMAIL, SELF_HOSTING_URL, type LegalCopy } from './types'

/**
 * Bahasa Indonesia — the original, and the language both documents were
 * written against the code in.
 *
 * `en.ts` is *translated from* this file: the same claims, in the same order,
 * nothing added because an English sentence wanted one more point and nothing
 * dropped because it read awkwardly. In a legal document that rule stops being
 * stylistic — a claim that exists in one language and not the other is two
 * different policies, and the reader of the weaker one was never told.
 *
 * ## Every sentence here is a claim about the code
 *
 * D-091 and D-092 are in this repository's history because this page said
 * "backup terenkripsi" and the platform's pipeline is `pg_dumpall | gzip -9`
 * followed by an `rclone copy`. Nothing encrypted anything. The claim was
 * plausible, nobody checked it, and the moment it would have been checked is
 * the moment it mattered.
 *
 * So: check the code, not the previous version of this file. The specific
 * things that were verified when it was last rewritten, with where:
 *
 *   - the 30-day trash window and the never-purged-if-reviewed exemption —
 *     `internal/store/purge.go` and `PurgeDeletedCards`
 *   - what leaves for Sentry — `scrubEvent` in `internal/api/sentry.go`
 *   - what the archive holds and what it deliberately omits —
 *     `internal/store/queries/export.sql`, which has no `SELECT *` in it
 *   - deletion being immediate and cascading, not a tombstone — 07 L7, and
 *     migration 00009 dropping `users.deleted_at`
 *   - session, verification and reset lifetimes — `SESSION_TTL_DAYS` in
 *     `internal/config/config.go`, `VerifyTTL` and `ResetTTL` in
 *     `internal/auth/token.go`
 *   - suspension holding nothing and blocking everything —
 *     migration 00013, `internal/auth/suspend.go`, `requireNotSuspended`
 *   - the backups: the platform's `backup.sh` / `ship-backups.sh`, which is
 *     where the encryption sentence comes from and where it has to keep coming
 *     from (D-088, D-092)
 */
export const id: LegalCopy = {
  frame: {
    back: 'Kembali',
    updatedPrefix: (date) => `Terakhir diperbarui: ${date}`,
    contact: 'Ada yang kurang jelas? Tulis ke',
  },

  privacy: {
    title: 'Kebijakan Privasi',
    updated: '26 Agustus 2026',

    intro: [
      {
        kind: 'p',
        text:
          '*Singkatnya:* Konku menyimpan apa yang kamu tulis, nama kamu, dan alamat ' +
          'email kamu. Datanya tidak dijual, tidak dipakai untuk iklan, dan tidak ' +
          'dipakai untuk melatih model AI apa pun. Tidak ada pelacak pihak ketiga di ' +
          'aplikasi ini.',
      },
    ],

    sections: {
      stored: {
        heading: 'Yang disimpan',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Alamat email.* Untuk masuk, memverifikasi akun, dan mengirim tautan ' +
                'reset kata sandi.',
              '*Nama.* Nama depan, dan nama belakang kalau kamu mengisinya. Dipakai ' +
                'untuk menyapa kamu di dalam aplikasi — tidak dikirim ke pihak mana ' +
                'pun, dan tidak terlihat oleh pengguna lain, karena tidak ada halaman ' +
                'di Konku yang menampilkan akun orang lain.',
              '*Kata sandi.* Disimpan sebagai hash argon2id, bukan sebagai teks. ' +
                'Tidak bisa dibaca kembali — termasuk oleh kami.',
              '*Tanggal akun.* Kapan akun dibuat, dan kapan alamat emailnya ' +
                'diverifikasi.',
              '*Status akun.* Kalau akun ini pernah kami tangguhkan, kolom itu ' +
                'menyimpan sejak kapan. Lihat "Kalau akun ditangguhkan" di bawah.',
              '*Catatan.* Judul, isinya, domain yang kamu pilih, kategori yang kamu ' +
                'pasang, serta kapan dibuat dan terakhir diubah.',
              '*Kartu.* Sisi depan dan sisi belakang, plus domain dan kategori yang ' +
                'sama seperti catatan.',
              '*Kategori dan domain.* Namanya, warnanya, urutannya, kuota mingguan ' +
                'tiap domain, dan yang sudah kamu arsipkan.',
              '*Jadwal tiap kartu.* Tahapnya, kapan jadwal berikutnya, berapa kali ' +
                'kamu melupakannya, dan status kartunya.',
              '*Riwayat ulangan.* Setiap kali kamu mengulang sebuah kartu: ' +
                'penilaianmu, jarak jadwal sebelum dan sesudahnya, waktunya, apakah ' +
                'itu dari antrean harian atau dari latihan, dan apakah bentuknya ' +
                'jawab-sendiri atau pilihan ganda.',
              '*Sesi fokus.* Berapa menit, tanggalnya, kapan selesai, dan domain yang ' +
                'kamu kerjakan.',
              '*Latihan.* Judul, deskripsi, cara kartunya dipilih, jumlah soal, batas ' +
                'waktu, bentuknya, dan yang sudah kamu arsipkan.',
              '*Hasil tiap kali latihan dikerjakan.* Kapan dimulai, kapan selesai, ' +
                'tanggalnya, jumlah soal, dan berapa yang benar. Untuk latihan ' +
                'berbentuk pilihan ganda, pilihan yang muncul di layar ikut disimpan — ' +
                'kalau tidak, hasil yang lama tidak bisa dibaca lagi sebagai soal yang ' +
                'pernah kamu kerjakan.',
              '*Sesi login.* Waktu masuk, waktu aktif terakhir, kapan kedaluwarsa, ' +
                'alamat IP, dan identitas browser. Ini yang membuat halaman ' +
                '"Perangkat yang masuk" bisa ada, supaya kamu bisa mengakhiri sesi ' +
                'yang tidak kamu kenali.',
              '*Tautan verifikasi dan reset.* Tautannya sendiri tidak disimpan — yang ' +
                'disimpan adalah hash-nya, sekali pakai, dan hangus setelah dipakai ' +
                'atau setelah waktunya habis.',
              '*Pengaturan akun.* Durasi timer bawaan, langkah fokus, apakah ' +
                'rotasi domain dinyalakan, dan bahasa yang kamu pilih.',
            ],
          },
        ],
      },

      notStored: {
        heading: 'Yang tidak disimpan',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Tidak ada analytics, cookie iklan, atau pelacak pihak ketiga.',
              'Tidak ada data lokasi.',
              'Isi permintaan, token, hash kata sandi, dan alamat email tidak pernah ' +
                'masuk ke log server. Log hanya berisi ID akun dan ID permintaan.',
              'Tidak ada statistik gabungan lintas akun. Semua angka di aplikasi ini ' +
                'dihitung per akun, untuk akun itu saja. Server memang menghitung hal ' +
                'operasional — berapa permintaan per rute, berapa yang gagal — tapi ' +
                'angka-angka itu tidak membawa identitas akun sama sekali, jadi tidak ' +
                'bisa dipecah per orang.',
            ],
          },
        ],
      },

      processors: {
        heading: 'Siapa lagi yang menerima data',
        blocks: [
          {
            kind: 'p',
            text:
              'Data kamu tidak dibagikan ke siapa pun untuk keperluan mereka sendiri. ' +
              'Empat pihak menerima sebagian data supaya layanan ini bisa jalan:',
          },
          {
            kind: 'ul',
            items: [
              '*Resend* — pengirim email. Menerima alamat email kamu dan isi pesan ' +
                'verifikasi atau reset kata sandi. Tidak menerima catatan kamu.',
              '*Sentry* — laporan error. Menerima pesan error dan ID akun saja. Isi ' +
                'permintaan, alamat email, dan alamat IP dibuang sebelum dikirim.',
              '*Penyedia server* — tempat basis data berjalan, seperti halnya semua ' +
                'layanan yang berjalan di suatu tempat.',
              '*Cloudflare R2* — tempat salinan backup disimpan di luar server. Isinya ' +
                'dump basis data, jadi semua yang ada di daftar atas ikut ada di sana.',
            ],
          },
        ],
      },

      browser: {
        heading: 'Cookie dan penyimpanan di browser',
        blocks: [
          {
            kind: 'p',
            text:
              'Satu cookie, dan gunanya cuma satu: menandai bahwa kamu sudah masuk. ' +
              'Cookie itu terkunci ke satu alamat situs, tidak bisa dibaca oleh ' +
              'JavaScript, dan tidak dikirim ke situs lain. Tidak ada cookie iklan dan tidak ada cookie ' +
              'pihak ketiga, jadi tidak ada spanduk persetujuan cookie di sini — tidak ' +
              'ada yang perlu kamu setujui.',
          },
          {
            kind: 'p',
            text:
              'Selain itu aplikasi menyimpan beberapa hal di browser kamu sendiri, ' +
              'bukan di server: tema terang atau gelap, bahasa yang dipakai saat ' +
              'memuat halaman, keadaan timer yang sedang jalan, cara daftar catatan ' +
              'dan kartu ditampilkan, dan jeda tombol "kirim ulang". Semua itu hilang ' +
              'saat kamu keluar, kecuali tema dan bahasa. Tema memang hanya ada di ' +
              'layar ini. Bahasa berbeda: yang disimpan di browser cuma catatan ' +
              'kecil supaya halaman langsung tampil dalam bahasa yang benar — ' +
              'pilihan yang sebenarnya ada di akun kamu dan ikut ke perangkat lain.',
          },
        ],
      },

      retention: {
        heading: 'Berapa lama disimpan',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Selama akun kamu ada.',
              'Catatan dan kartu yang kamu hapus pindah ke *Terhapus* dan bisa ' +
                'dikembalikan selama *30 hari*. Setelah itu benar-benar dihapus. Kartu ' +
                'yang pernah kamu ulang, atau pernah keluar di latihan yang benar-benar ' +
                'dikerjakan, dikecualikan — kartunya tetap disimpan supaya riwayat ' +
                'belajarmu tidak menunjuk ke sesuatu yang sudah tidak ada.',
              'Kalau kamu *menghapus akun*, semua baris milik akun itu hilang saat itu ' +
                'juga — bukan ditandai terhapus, tapi benar-benar dihapus. Alamat ' +
                'emailnya bisa dipakai mendaftar lagi setelahnya.',
              'Ada backup harian di server, dan salinannya dikirim ke penyimpanan di ' +
                'luar server (Cloudflare R2). Pengirimannya lewat koneksi terenkripsi ' +
                'dan salinan di R2 terenkripsi saat disimpan di sana, tapi file ' +
                'backup-nya sendiri *tidak kami enkripsi* — yang menjaganya adalah ' +
                'akses ke server dan ke penyimpanan itu yang dibatasi. Backup disimpan ' +
                'paling lama *30 hari*, jadi paling lambat 30 hari setelah kamu ' +
                'menghapus akun, datanya ikut hilang dari backup.',
              'Sesi login kedaluwarsa setelah 30 hari. Tautan verifikasi berlaku 24 ' +
                'jam, tautan reset kata sandi 1 jam.',
            ],
          },
        ],
      },

      suspension: {
        heading: 'Kalau akun ditangguhkan',
        blocks: [
          {
            kind: 'p',
            text:
              'Akun bisa kami tangguhkan kalau jelas dipakai untuk menyalahgunakan ' +
              'layanan ini — misalnya mengirimi orang lain email verifikasi ' +
              'bertubi-tubi. Alasannya ada di [Ketentuan Layanan](/terms).',
          },
          {
            kind: 'ul',
            items: [
              '*Tidak ada yang dihapus.* Penangguhan hanya mencatat satu hal: sejak ' +
                'kapan. Semua yang kamu tulis tetap ada persis seperti sebelumnya.',
              '*Bisa dibatalkan.* Kalau penangguhannya dicabut, akunnya kembali ' +
                'seperti semula — ini bukan penghapusan, dan tidak berubah menjadi ' +
                'penghapusan setelah sekian lama.',
              '*Selama berlaku, akunnya tidak bisa dipakai* — termasuk untuk mengunduh ' +
                'data dan untuk menghapus akun, karena keduanya lewat pintu yang sama. ' +
                'Sesi login yang sedang terbuka juga diakhiri. Kalau kamu butuh ' +
                `datanya, tulis ke [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) dan ` +
                'aksesnya kami buka untuk itu.',
            ],
          },
        ],
      },

      rights: {
        heading: 'Hak kamu',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Ambil semuanya.* Pengaturan → Data kamu → Unduh. Catatan dan kartu ' +
                'berupa file markdown biasa, sisanya JSON. Isinya adalah semua yang ' +
                'ada di daftar "Yang disimpan" kecuali yang berupa kredensial — sesi ' +
                'login, hash kata sandi dan hash tautan tidak ikut, karena file yang ' +
                'dikirim lewat email bukan tempat untuk itu. Tidak ada yang dikunci.',
              '*Hapus semuanya.* Pengaturan → Hapus akun.',
              '*Perbaiki.* Semua yang tersimpan bisa kamu ubah langsung di aplikasi.',
            ],
          },
        ],
      },

      incidents: {
        heading: 'Kalau ada masalah',
        blocks: [
          {
            kind: 'p',
            text:
              'Kalau terjadi gangguan atau data ada yang terdampak, kami memberi tahu ' +
              'lewat email ke alamat akun yang terpengaruh. Kami tidak menunggu kamu ' +
              'yang bertanya duluan.',
          },
        ],
      },

      changes: {
        heading: 'Perubahan',
        blocks: [
          {
            kind: 'p',
            text:
              'Kalau kebijakan ini berubah dengan cara yang memengaruhi kamu, kami ' +
              'kirim email sebelum perubahannya berlaku. Tanggal di atas selalu ' +
              'menunjukkan versi terbaru.',
          },
        ],
      },
    },

    outro: [{ kind: 'p', text: 'Lihat juga [Ketentuan Layanan](/terms).' }],
  },

  terms: {
    title: 'Ketentuan Layanan',
    updated: '26 Agustus 2026',

    intro: [
      {
        kind: 'p',
        text:
          'Konku adalah layanan gratis yang dijalankan oleh satu orang. Ketentuan ini ' +
          'sengaja pendek — kalau ada yang tidak jelas, tanya saja.',
      },
    ],

    sections: {
      free: {
        heading: 'Gratis, dan tetap gratis',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Tidak ada biaya, dan tidak akan ada.* Tidak ada paket berbayar, tidak ' +
                'ada tingkatan, dan tidak ada fitur yang dikunci sampai kamu ' +
                'membayar — sekarang maupun nanti. Batas jumlah catatan dan kartu di ' +
                'bawah itu batas kapasitas, bukan harga.',
              '*Sebisanya, bukan dengan jaminan.* Yang gratis di sini adalah ' +
                'layanannya, dan yang menyertainya adalah usaha terbaik satu orang — ' +
                'bukan janji ketersediaan. Selengkapnya di "Ketersediaan" di bawah.',
              '*Datanya bisa kamu bawa pergi kapan saja.* Satu tombol, satu file, ' +
                'tanpa perlu bertanya lebih dulu. Itu yang membuat kalimat di atas ' +
                'bukan jebakan: layanan gratis yang menahan datamu adalah harga yang ' +
                'ditagih belakangan.',
              '*Kalau biayanya jadi terlalu besar, jawabannya bukan memasang harga.* ' +
                'Kodenya terbuka dan kamu bisa menjalankan salinanmu sendiri — ' +
                `caranya ada di [panduan self-hosting](${SELF_HOSTING_URL}). Itu ` +
                'sebabnya "gratis" di sini bisa ditulis tanpa syarat.',
            ],
          },
        ],
      },

      account: {
        heading: 'Akun',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Satu akun untuk satu orang. Jaga kata sandi kamu.',
              'Alamat email harus yang bisa kamu akses. Itu satu-satunya cara ' +
                'memulihkan akun kalau kata sandinya lupa.',
              'Kamu bertanggung jawab atas apa yang terjadi lewat akun kamu. Kalau ada ' +
                'yang janggal, ada halaman "Perangkat yang masuk" untuk mengakhiri sesi.',
            ],
          },
        ],
      },

      yourContent: {
        heading: 'Yang kamu tulis',
        blocks: [
          {
            kind: 'ul',
            items: [
              '*Isinya milik kamu.* Kami tidak mengklaim kepemilikan apa pun atas ' +
                'catatan, kartu, atau apa pun yang kamu buat.',
              'Kami tidak membaca isi akun kamu, kecuali kamu memintanya untuk ' +
                'membantu menyelesaikan masalah.',
              'Kamu bisa mengunduh semuanya kapan saja, tanpa bertanya lebih dulu.',
            ],
          },
        ],
      },

      notAllowed: {
        heading: 'Yang tidak boleh',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Mencoba masuk ke akun orang lain.',
              'Membebani layanan dengan sengaja. Ada batas jumlah catatan, kartu, dan ' +
                'perubahan per menit — angkanya jauh di atas pemakaian normal, jadi ' +
                'kamu tidak akan menyentuhnya kalau memakai aplikasinya sebagaimana ' +
                'mestinya.',
              'Memakai layanan ini untuk sesuatu yang melanggar hukum.',
            ],
          },
          {
            kind: 'p',
            text:
              'Kalau ada akun yang jelas menyalahgunakan, akunnya bisa *ditangguhkan*. ' +
              'Penangguhan tidak menghapus apa pun dan bisa dibatalkan — tapi selama ' +
              'berlaku, akun itu tidak bisa dipakai, termasuk untuk mengunduh datanya. ' +
              `Kalau kamu perlu datanya, tulis ke [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) ` +
              'dan aksesnya kami buka untuk itu. Apa yang tersimpan selama penangguhan ' +
              'ada di [Kebijakan Privasi](/privacy).',
          },
        ],
      },

      availability: {
        heading: 'Ketersediaan',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Layanan ini disediakan *apa adanya*, *tanpa jaminan* waktu aktif. Bisa ' +
                'saja mati sebentar untuk pemeliharaan, atau mati karena ada yang rusak.',
              'Ada backup harian dan prosedur pemulihan yang sudah pernah diuji, tapi ' +
                'tidak ada sistem yang bebas risiko. Kalau datanya penting, unduh ' +
                'salinannya sesekali — fiturnya memang untuk itu.',
            ],
          },
        ],
      },

      closing: {
        heading: 'Kalau layanan ini berhenti',
        blocks: [
          {
            kind: 'p',
            text:
              'Kalau Konku ditutup, kamu diberi tahu lewat email *minimal 30 hari* ' +
              'sebelumnya, dan fitur unduh tetap jalan selama masa itu. Tidak ada data ' +
              'yang hilang tanpa pemberitahuan — itu janji yang paling dasar dari ' +
              'aplikasi ini.',
          },
        ],
      },

      liability: {
        heading: 'Tanggung jawab',
        blocks: [
          {
            kind: 'p',
            text:
              'Karena layanan ini gratis dan disediakan apa adanya, tidak ada tanggung ' +
              'jawab atas kerugian yang timbul dari pemakaiannya, sejauh yang ' +
              'diizinkan hukum yang berlaku. Yang bisa kami janjikan adalah yang ' +
              'tertulis di atas: pemberitahuan kalau ada masalah, dan datamu selalu ' +
              'bisa diambil.',
          },
        ],
      },

      changes: {
        heading: 'Perubahan',
        blocks: [
          {
            kind: 'p',
            text:
              'Kalau ketentuan ini berubah dengan cara yang memengaruhi kamu, kami ' +
              'kirim email sebelum perubahannya berlaku.',
          },
        ],
      },
    },

    outro: [{ kind: 'p', text: 'Lihat juga [Kebijakan Privasi](/privacy).' }],
  },
}
