package export

import (
	"fmt"
	"strings"
)

// readme is the first thing in the archive, and it is in Indonesian because it
// is user-facing copy (hard rule 8).
//
// It exists because an archive nobody can read is not an export. Someone
// opening this a year from now — possibly because the service is gone — needs
// to know what the folders are and what the JSON is for, without the code.
func readme(a *Archive) string {
	var b strings.Builder

	b.WriteString("# Data Konku kamu\n\n")
	b.WriteString(fmt.Sprintf("Arsip ini berisi semua yang tersimpan di akun %s.\n\n", a.User.Email))

	b.WriteString("Semuanya milik kamu. Tidak ada yang dikunci di format khusus:\n")
	b.WriteString("catatan dan kartu berupa file markdown biasa, sisanya JSON.\n\n")

	b.WriteString("## Isi\n\n")
	b.WriteString("| Folder | Isinya |\n")
	b.WriteString("|---|---|\n")
	b.WriteString("| `notes/` | Catatan kamu, satu file per catatan. |\n")
	b.WriteString("| `notes/terhapus/` | Catatan yang sudah kamu hapus, tetap disimpan di sini. |\n")
	b.WriteString("| `cards/` | Kartu hafalan, satu file per kartu. |\n")
	b.WriteString("| `cards/terhapus/` | Kartu yang sudah dihapus. |\n")
	b.WriteString("| `data/` | Sisanya: jadwal ulang, riwayat review, sesi fokus, domain, kategori, ujian. |\n\n")

	b.WriteString("## Membuka di Obsidian\n\n")
	b.WriteString("Buka folder `notes/` sebagai vault. Judul, domain, dan kategori\n")
	b.WriteString("ada di bagian frontmatter tiap file, jadi langsung terbaca.\n\n")

	b.WriteString("## Tentang folder `data/`\n\n")
	b.WriteString("Bagian ini yang tidak bisa dibuat ulang dari catatan saja —\n")
	b.WriteString("terutama `reviews.json`, riwayat setiap kali kamu me-review kartu.\n")
	b.WriteString("Setiap baris menunjuk ke kartu lewat `card_id`, yang cocok dengan\n")
	b.WriteString("`id` di `cards.json`.\n\n")

	b.WriteString("Kata sandi dan sesi login **tidak** ada di arsip ini, dan memang\n")
	b.WriteString("tidak seharusnya ada.\n\n")

	b.WriteString("## Ringkasan\n\n")
	b.WriteString(fmt.Sprintf("- %d catatan\n", len(a.Notes)))
	b.WriteString(fmt.Sprintf("- %d kartu\n", len(a.Cards)))
	b.WriteString(fmt.Sprintf("- %d riwayat review\n", len(a.ReviewLogs)))
	b.WriteString(fmt.Sprintf("- %d sesi fokus\n", len(a.FocusSessions)))
	b.WriteString(fmt.Sprintf("- %d ujian\n", len(a.Exams)))

	return b.String()
}
