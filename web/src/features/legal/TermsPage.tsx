import { Link } from 'react-router-dom'
import { LegalPage } from './LegalPage'

/**
 * Terms of service (07 L9).
 *
 * Short, and honest about what this is: a free service run by one person on a
 * rented server, with no uptime guarantee. Promising an SLA that nobody is
 * staffed to meet would be the same failure as a copy-pasted privacy policy —
 * a document describing a product that does not exist.
 *
 * The tone rule holds here as much as in the app (hard rule 6). Terms are
 * where products go to sound threatening; these state what is expected and
 * what happens if it is not, without the posturing.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Ketentuan Layanan" updated="12 Agustus 2026">
      <p>
        Konku adalah layanan gratis yang dijalankan oleh satu orang. Ketentuan ini
        sengaja pendek — kalau ada yang tidak jelas, tanya saja.
      </p>

      <h2>Akun</h2>
      <ul>
        <li>Satu akun untuk satu orang. Jaga kata sandi kamu.</li>
        <li>
          Alamat email harus yang bisa kamu akses. Itu satu-satunya cara memulihkan akun
          kalau kata sandinya lupa.
        </li>
        <li>
          Kamu bertanggung jawab atas apa yang terjadi lewat akun kamu. Kalau ada yang
          janggal, ada halaman "Perangkat yang masuk" untuk mengakhiri sesi.
        </li>
      </ul>

      <h2>Yang kamu tulis</h2>
      <ul>
        <li>
          <strong>Isinya milik kamu.</strong> Kami tidak mengklaim kepemilikan apa pun
          atas catatan, kartu, atau apa pun yang kamu buat.
        </li>
        <li>
          Kami tidak membaca isi akun kamu, kecuali kamu memintanya untuk membantu
          menyelesaikan masalah.
        </li>
        <li>Kamu bisa mengunduh semuanya kapan saja, tanpa bertanya lebih dulu.</li>
      </ul>

      <h2>Yang tidak boleh</h2>
      <ul>
        <li>Mencoba masuk ke akun orang lain.</li>
        <li>
          Membebani layanan dengan sengaja. Ada batas jumlah catatan, kartu, dan
          perubahan per menit — angkanya jauh di atas pemakaian normal, jadi kamu tidak
          akan menyentuhnya kalau memakai aplikasinya sebagaimana mestinya.
        </li>
        <li>Memakai layanan ini untuk sesuatu yang melanggar hukum.</li>
      </ul>
      <p>
        Kalau ada akun yang jelas menyalahgunakan, akunnya bisa dihentikan. Kalau itu
        terjadi dan datanya bukan bagian dari penyalahgunaannya, kamu tetap diberi
        kesempatan mengunduh datamu lebih dulu.
      </p>

      <h2>Ketersediaan</h2>
      <ul>
        <li>
          Layanan ini disediakan <strong>apa adanya</strong>, tanpa jaminan waktu aktif.
          Bisa saja mati sebentar untuk pemeliharaan, atau mati karena ada yang rusak.
        </li>
        <li>
          Ada backup harian dan prosedur pemulihan yang sudah pernah diuji, tapi tidak
          ada sistem yang bebas risiko. Kalau datanya penting, unduh salinannya
          sesekali — fiturnya memang untuk itu.
        </li>
      </ul>

      <h2>Kalau layanan ini berhenti</h2>
      <p>
        Kalau Konku ditutup, kamu diberi tahu lewat email <strong>minimal 30 hari</strong>{' '}
        sebelumnya, dan fitur unduh tetap jalan selama masa itu. Tidak ada data yang
        hilang tanpa pemberitahuan — itu janji yang paling dasar dari aplikasi ini.
      </p>

      <h2>Tanggung jawab</h2>
      <p>
        Karena layanan ini gratis dan disediakan apa adanya, tidak ada tanggung jawab
        atas kerugian yang timbul dari pemakaiannya, sejauh yang diizinkan hukum yang
        berlaku. Yang bisa kami janjikan adalah yang tertulis di atas: pemberitahuan
        kalau ada masalah, dan datamu selalu bisa diambil.
      </p>

      <h2>Perubahan</h2>
      <p>
        Kalau ketentuan ini berubah dengan cara yang memengaruhi kamu, kami kirim email
        sebelum perubahannya berlaku.
      </p>

      <p>
        Lihat juga <Link to="/privacy">Kebijakan Privasi</Link>.
      </p>
    </LegalPage>
  )
}
