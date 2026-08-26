package i18n

import "fmt"

// Bahasa Indonesia — the original copy, and the fallback.
//
// English is translated from this file, not written alongside it. When a string
// changes, it changes here first and `en.go` follows; the reverse produces two
// catalogs that drift apart while both still compile.
//
// Every rule in `catalog.go` applies: plain, direct, active voice, sentence
// case, no filler, and never punitive. These are refusals, which is where
// punitive copy is hardest to notice — a refusal that scolds reads as ordinary
// firmness. It says what happened and what to do, and it never says the reader
// should have known better.
//
// One tone decision worth keeping: a refusal that touches a password or an
// account says what did *not* happen. "Kata sandi kamu tidak berubah" is not
// reassurance for its own sake — somebody who cannot tell whether a failed
// attempt changed something is worse off than before they tried.

// dot is the Indonesian thousands separator: 5.000, not 5,000.
const dot = "."

var idCatalog = Catalog{
	Common: CommonCopy{
		BadRequest:  "Permintaan tidak valid.",
		NotFound:    "Tidak ditemukan.",
		ServerError: "Terjadi kesalahan di server. Coba lagi sebentar lagi.",
		ServerErrorWithCode: func(requestID string) string {
			return "Terjadi kesalahan di server. Coba lagi sebentar lagi. Kode: " + requestID
		},
		NotSignedIn:       "Kamu belum masuk.",
		NotSignedInShort:  "Belum masuk.",
		SessionExpired:    "Sesi kamu sudah berakhir. Masuk lagi ya.",
		TooManyAttempts:   "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
		TooManyForAddress: "Terlalu banyak percobaan untuk alamat ini. Coba lagi beberapa menit lagi.",
		InvalidFilter:     "Filter tidak valid.",
		BadColor:          "Warna harus dalam format #RRGGBB.",
	},

	Auth: AuthCopy{
		CredentialsRequired: "Email dan kata sandi wajib diisi.",
		WrongCredentials:    "Email atau kata sandi salah.",
		EmailNotVerified:    "Verifikasi alamat email kamu dulu ya. Cek kotak masuk untuk tautannya.",
		AccountSuspended: func(contact string) string {
			return fmt.Sprintf(
				"Akun ini sedang ditangguhkan. Hubungi %s kalau ada yang perlu ditanyakan.", contact)
		},
		InvalidEmail: "Alamat email tidak valid.",
		PasswordTooShort: func(min int) string {
			return fmt.Sprintf(
				"Kata sandi minimal %d karakter. "+
					"Kalimat yang panjang lebih aman dan lebih mudah diingat.", min)
		},
		FirstNameRequired:       "Nama depan wajib diisi.",
		LastNameTooLong:         "Nama belakang terlalu panjang.",
		VerifyLinkExpired:       "Tautan verifikasi tidak berlaku lagi. Minta tautan baru ya.",
		ResetLinkExpired:        "Tautan ini tidak berlaku lagi. Minta tautan baru ya.",
		CurrentPasswordRequired: "Masukkan kata sandi kamu saat ini.",
		CurrentPasswordWrong:    "Kata sandi saat ini salah. Kata sandi kamu tidak berubah.",
		PasswordUnchanged:       "Kata sandi baru masih sama dengan yang lama. Pilih yang berbeda ya.",
	},

	Account: AccountCopy{
		ConfirmWithPassword:     "Masukkan kata sandi kamu untuk mengonfirmasi.",
		WrongPasswordNotDeleted: "Kata sandi salah. Akun kamu tidak jadi dihapus.",
		ExportTooLarge: "Arsip kamu terlalu besar untuk dibuat sekaligus. " +
			"Hubungi pengelola supaya ekspornya bisa dibagi.",
		TooManyExports: "Terlalu banyak permintaan ekspor. Coba lagi satu jam lagi — " +
			"arsip yang sudah diunduh tetap lengkap.",
		TooManyDeleteAttempts:  "Terlalu banyak percobaan penghapusan akun. Coba lagi satu jam lagi.",
		TooManyPasswordChanges: "Terlalu banyak percobaan ganti kata sandi. Coba lagi satu jam lagi.",
	},

	Notes: NotesCopy{
		TitleTooLong: "Judul terlalu panjang.",
		BodyTooLong:  "Catatan terlalu panjang.",
	},

	Cards: CardsCopy{
		FrontEmpty: "Pertanyaan tidak boleh kosong.",
		BackEmpty:  "Jawaban tidak boleh kosong.",
		TooLong:    "Kartu terlalu panjang.",
	},

	Domains: DomainsCopy{
		Unknown:         "Domain tidak dikenal.",
		NameTaken:       "Sudah ada domain dengan nama itu.",
		InUse:           "Domain ini masih dipakai catatan atau sesi. Arsipkan saja.",
		NameEmpty:       "Nama domain tidak boleh kosong.",
		NameTooLong:     "Nama domain terlalu panjang.",
		BadWeeklyQuota:  "Target mingguan tidak masuk akal.",
		TooManySelected: "Terlalu banyak domain.",
	},

	Categories: CategoriesCopy{
		Unknown:         "Kategori tidak dikenal.",
		NameTaken:       "Sudah ada kategori dengan nama itu.",
		InUse:           "Kategori ini masih dipakai. Arsipkan saja kalau sudah tidak perlu.",
		NameEmpty:       "Nama kategori tidak boleh kosong.",
		NameTooLong:     "Nama kategori terlalu panjang.",
		NameInvalid:     "Nama kategori tidak valid.",
		TooManySelected: "Terlalu banyak kategori.",
	},

	Review: ReviewCopy{
		BadRating: "Penilaian harus 'ingat' atau 'lupa'.",
	},

	Sets: SetsCopy{
		AlreadyAttempted:   "Latihan ini sudah pernah dikerjakan. Arsipkan saja.",
		FixedOnly:          "Hanya latihan dengan soal tetap yang punya daftar kartu.",
		TooManyQuestions:   "Terlalu banyak soal.",
		UnknownCard:        "Ada kartu yang tidak dikenal.",
		TitleEmpty:         "Judul latihan tidak boleh kosong.",
		TitleTooLong:       "Judul latihan terlalu panjang.",
		DescriptionTooLong: "Deskripsi latihan terlalu panjang.",
		BadSelection:       "Jenis soal harus 'fixed' atau 'random'.",
		BadFormat:          "Bentuk soal harus 'recall' atau 'choice'.",
		BadCount:           "Jumlah soal tidak masuk akal.",
		BadTimeLimit:       "Batas waktu tidak masuk akal.",
		BadDate:            "Tanggal tidak valid.",
		DateTooFarOff:      "Tanggal terlalu jauh dari hari ini. Cek jam di perangkat kamu.",
		NoMatchingCards: "Belum ada kartu yang cocok dengan filter ini. " +
			"Longgarkan filternya atau tulis kartu dulu.",
		RunFinished:    "Latihan ini sudah selesai.",
		ChooseAnAnswer: "Pilih salah satu jawaban.",
		UnknownChoice:  "Pilihan tidak dikenal.",
	},

	Sessions: SessionsCopy{
		BadDuration:   "Durasi sesi tidak masuk akal.",
		BadDate:       "Tanggal sesi tidak valid.",
		DateTooFarOff: "Tanggal sesi terlalu jauh dari hari ini. Cek jam di perangkat kamu.",
	},

	Settings: SettingsCopy{
		BadDuration: func(min, max int) string {
			return fmt.Sprintf("Durasi default harus antara %d dan %d menit.", min, max)
		},
		BadFocusStep: func(min, max int) string {
			return fmt.Sprintf("Progressive focus harus antara %d dan %d.", min, max)
		},
	},

	Bulk: BulkCopy{
		NothingSelected:  "Tidak ada yang dipilih.",
		TooManySelected:  "Terlalu banyak yang dipilih sekaligus.",
		InvalidSelection: "Pilihan tidak valid.",
	},

	Quota: QuotaCopy{
		Notes: func(max int) string {
			return fmt.Sprintf(
				"Kamu sudah punya %s catatan, batas maksimum untuk satu akun. "+
					"Hapus beberapa yang tidak terpakai untuk menulis lagi.", group(max, dot))
		},
		Cards: func(max int) string {
			return fmt.Sprintf(
				"Kamu sudah punya %s kartu, batas maksimum untuk satu akun. "+
					"Hapus beberapa yang tidak terpakai untuk membuat kartu lagi.", group(max, dot))
		},
		Writes: func(perMinute int) string {
			return fmt.Sprintf(
				"Terlalu banyak perubahan dalam waktu singkat — batasnya %s per menit. "+
					"Tunggu sebentar, lalu coba lagi.", group(perMinute, dot))
		},
	},

	Security: SecurityCopy{
		CrossSite: "Permintaan ditolak karena berasal dari situs lain.",
		JSONOnly:  "Permintaan harus berupa JSON.",
	},
}
