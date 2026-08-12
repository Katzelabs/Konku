import { Link } from 'react-router-dom'
import { LegalPage } from './LegalPage'

/**
 * The privacy policy (07 L9).
 *
 * Written against what the code actually does, not from a template. L9 is
 * explicit that copy-pasted boilerplate is worse than none, because it
 * describes a product that is not this one — and the test of this page is
 * whether somebody who has never seen the code could read it and say what the
 * app stores.
 *
 * Two places where honesty required more words than the task's summary:
 *
 *   - "shared with nobody" is not literally true and saying so would be the
 *     boilerplate problem in reverse. Mail goes through Resend, error reports
 *     go to Sentry, and the database sits on a rented server. Those are named
 *     below with exactly what each one receives.
 *   - the 30-day figure is a promise about backup retention. It is only true
 *     if the restic policy on the box is set to match, which is why 04-ship S3
 *     now says so.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Kebijakan Privasi" updated="12 Agustus 2026">
      <p>
        <strong>Singkatnya:</strong> Konku menyimpan apa yang kamu tulis, nama kamu,
        dan alamat email kamu. Datanya tidak dijual, tidak dipakai untuk iklan, dan tidak dipakai
        untuk melatih model AI apa pun. Tidak ada pelacak pihak ketiga di aplikasi ini.
      </p>

      <h2>Yang disimpan</h2>
      <ul>
        <li>
          <strong>Alamat email.</strong> Untuk masuk, memverifikasi akun, dan mengirim
          tautan reset kata sandi.
        </li>
        <li>
          <strong>Nama.</strong> Nama depan, dan nama belakang kalau kamu mengisinya.
          Dipakai untuk menyapa kamu di dalam aplikasi — tidak dikirim ke pihak mana
          pun, dan tidak terlihat oleh pengguna lain, karena tidak ada halaman di
          Konku yang menampilkan akun orang lain.
        </li>
        <li>
          <strong>Kata sandi.</strong> Disimpan sebagai hash argon2id, bukan sebagai
          teks. Tidak bisa dibaca kembali — termasuk oleh kami.
        </li>
        <li>
          <strong>Apa yang kamu tulis.</strong> Catatan, kartu, kategori, dan domain.
        </li>
        <li>
          <strong>Riwayat belajar.</strong> Jadwal ulang tiap kartu, catatan setiap kali
          kamu mengulang sebuah kartu, sesi fokus, serta latihan yang kamu susun dan
          hasil tiap kali dikerjakan. Untuk latihan berbentuk pilihan ganda, pilihan
          yang muncul di layar ikut disimpan — kalau tidak, hasil yang lama tidak bisa
          dibaca lagi sebagai soal yang pernah kamu kerjakan.
        </li>
        <li>
          <strong>Sesi login.</strong> Waktu masuk, waktu aktif terakhir, alamat IP, dan
          identitas browser. Ini yang membuat halaman "Perangkat yang masuk" bisa ada,
          supaya kamu bisa mengakhiri sesi yang tidak kamu kenali.
        </li>
        <li>
          <strong>Pengaturan akun.</strong> Durasi timer, preferensi rotasi domain.
        </li>
      </ul>

      <h2>Yang tidak disimpan</h2>
      <ul>
        <li>Tidak ada analytics, cookie iklan, atau pelacak pihak ketiga.</li>
        <li>Tidak ada data lokasi.</li>
        <li>
          Isi permintaan, token, hash kata sandi, dan alamat email tidak pernah masuk ke
          log server. Log hanya berisi ID akun dan ID permintaan.
        </li>
        <li>
          Tidak ada statistik gabungan lintas akun. Semua angka di aplikasi ini dihitung
          per akun, untuk akun itu saja.
        </li>
      </ul>

      <h2>Siapa lagi yang menerima data</h2>
      <p>
        Data kamu tidak dibagikan ke siapa pun untuk keperluan mereka sendiri. Tiga
        pihak menerima sebagian data supaya layanan ini bisa jalan:
      </p>
      <ul>
        <li>
          <strong>Resend</strong> — pengirim email. Menerima alamat email kamu dan isi
          pesan verifikasi atau reset kata sandi. Tidak menerima catatan kamu.
        </li>
        <li>
          <strong>Sentry</strong> — laporan error. Menerima pesan error dan ID akun
          saja. Isi permintaan, alamat email, dan alamat IP dibuang sebelum dikirim.
        </li>
        <li>
          <strong>Penyedia server</strong> — tempat basis data berjalan, seperti halnya
          semua layanan yang berjalan di suatu tempat.
        </li>
      </ul>

      <h2>Berapa lama disimpan</h2>
      <ul>
        <li>Selama akun kamu ada.</li>
        <li>
          Catatan dan kartu yang kamu hapus pindah ke <strong>Terhapus</strong> dan bisa
          dikembalikan selama <strong>30 hari</strong>. Setelah itu benar-benar dihapus.
          Kartu yang pernah kamu ulang dikecualikan — kartunya tetap disimpan supaya
          riwayat belajarmu tidak menunjuk ke sesuatu yang sudah tidak ada.
        </li>
        <li>
          Kalau kamu <strong>menghapus akun</strong>, semua baris milik akun itu hilang
          saat itu juga — bukan ditandai terhapus, tapi benar-benar dihapus. Alamat
          emailnya bisa dipakai mendaftar lagi setelahnya.
        </li>
        <li>
          Backup terenkripsi disimpan paling lama <strong>30 hari</strong>. Jadi paling
          lambat 30 hari setelah kamu menghapus akun, datanya juga hilang dari backup.
        </li>
        <li>
          Sesi login kedaluwarsa setelah 30 hari. Tautan verifikasi berlaku 24 jam,
          tautan reset kata sandi 1 jam.
        </li>
      </ul>

      <h2>Hak kamu</h2>
      <ul>
        <li>
          <strong>Ambil semuanya.</strong> Pengaturan → Data kamu → Unduh. Catatan dan
          kartu berupa file markdown biasa, sisanya JSON. Tidak ada yang dikunci.
        </li>
        <li>
          <strong>Hapus semuanya.</strong> Pengaturan → Hapus akun.
        </li>
        <li>
          <strong>Perbaiki.</strong> Semua yang tersimpan bisa kamu ubah langsung di
          aplikasi.
        </li>
      </ul>

      <h2>Kalau ada masalah</h2>
      <p>
        Kalau terjadi gangguan atau data ada yang terdampak, kami memberi tahu lewat
        email ke alamat akun yang terpengaruh. Kami tidak menunggu kamu yang bertanya
        duluan.
      </p>

      <h2>Perubahan</h2>
      <p>
        Kalau kebijakan ini berubah dengan cara yang memengaruhi kamu, kami kirim email
        sebelum perubahannya berlaku. Tanggal di atas selalu menunjukkan versi terbaru.
      </p>

      <p>
        Lihat juga <Link to="/terms">Ketentuan Layanan</Link>.
      </p>
    </LegalPage>
  )
}
