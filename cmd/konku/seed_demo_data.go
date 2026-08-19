package main

// The content behind `konku seed-demo`.
//
// Separate from the machinery in seed_demo.go so that changing what the demo
// account contains never means reading insert statements, and so the two can
// be reviewed for different things: this file for whether it reads like a real
// knowledge base, that one for whether it writes valid rows.
//
// Everything here is user-facing copy, so it is in Bahasa Indonesia (hard
// rule 8). The comments are not.

// demoDomain is one row of the domains screen.
//
// Slug matches store.DefaultDomains where the two overlap, so seeding an
// account that already has its starter domains updates them in place rather
// than leaving a second Matematika behind.
type demoDomain struct {
	Slug  string
	Label string
	Color string
	Quota int32
}

var demoDomains = []demoDomain{
	{"general", "Pengetahuan Umum", "#4F7CAC", 2},
	{"math", "Matematika", "#6A8D73", 3},
	{"psychology", "Psikologi", "#B08968", 2},
	{"music", "Musik", "#8E7DBE", 1},
	{"english", "Bahasa Inggris", "#A0616A", 2},
	{"coding", "Coding", "#5C6B73", 0},
}

// demoCategory is a label shared by notes and cards (D-055).
type demoCategory struct {
	Slug  string
	Label string
	Color string
}

var demoCategories = []demoCategory{
	{"konsep", "Konsep Inti", "#4F7CAC"},
	{"rumus", "Rumus", "#6A8D73"},
	{"istilah", "Istilah", "#B08968"},
	{"studi-kasus", "Studi Kasus", "#8E7DBE"},
	{"ringkasan-buku", "Ringkasan Buku", "#7A6C5D"},
	{"kesalahan-umum", "Kesalahan Umum", "#A0616A"},
	{"latihan-soal", "Latihan Soal", "#5C6B73"},
	{"kutipan", "Kutipan", "#8C7B9E"},
}

// demoNote is one note. CreatedAgo and UpdatedAgo are in days before today;
// the list sorts on updated_at, so UpdatedAgo is what decides the order the
// screenshot will show.
type demoNote struct {
	Title      string
	Domain     string
	Categories []string
	Body       string
	CreatedAgo int
	UpdatedAgo int
	Deleted    bool
}

var demoNotes = []demoNote{
	{
		Title:      "Spaced repetition: kenapa jeda mengalahkan pengulangan",
		Domain:     "psychology",
		Categories: []string{"konsep", "ringkasan-buku"},
		CreatedAgo: 68,
		UpdatedAgo: 1,
		Body: `Mengulang lima kali dalam satu malam terasa produktif dan hampir tidak
meninggalkan apa-apa seminggu kemudian. Mengulang lima kali dengan jeda yang
melebar meninggalkan hampir semuanya.

## Kenapa jeda bekerja

Setiap kali sebuah ingatan hampir hilang lalu berhasil dipanggil kembali,
usaha memanggilnya itulah yang memperkuatnya. Kalau jedanya terlalu pendek,
tidak ada usaha — jawabannya masih menempel di kepala dan otak tidak belajar
apa-apa dari pengulangan itu.

## Tangga yang dipakai di sini

| Tahap | Jeda   |
|-------|--------|
| 1     | 1 hari |
| 2     | 3 hari |
| 3     | 7 hari |
| 4     | 14 hari|
| 5     | 30 hari|
| 6     | 90 hari|
| 7     | 180 hari|

Lupa satu kali menurunkan satu anak tangga, bukan mengembalikan ke nol.
Menghukum satu kesalahan dengan mengulang semuanya dari awal adalah cara
tercepat membuat orang berhenti.

## Yang sering disalahpahami

- **Jeda melebar bukan berarti makin jarang belajar.** Kartu lama menjauh,
  ruangnya dipakai kartu baru.
- **Rasa "sulit" saat memanggil ingatan itu sinyal bagus.** Kalau terlalu
  lancar, jedanya memang kependekan.

> Yang diukur bukan berapa lama belajar hari ini, tapi berapa banyak yang
> masih ada bulan depan.`,
	},
	{
		Title:      "Efek pengujian: membaca ulang kalah jauh dari mencoba mengingat",
		Domain:     "psychology",
		Categories: []string{"konsep", "kesalahan-umum"},
		CreatedAgo: 61,
		UpdatedAgo: 3,
		Body: `Kalau ada satu temuan psikologi belajar yang paling sering diabaikan, ini
orangnya: **mencoba mengingat sesuatu memperkuat ingatan itu lebih dari
membacanya lagi.**

## Bentuk eksperimennya

Dua kelompok membaca teks yang sama. Kelompok A membacanya empat kali.
Kelompok B membaca sekali lalu tiga kali mencoba menuliskan kembali isinya
tanpa melihat. Tes lima menit kemudian: kelompok A menang tipis. Tes seminggu
kemudian: kelompok B menang telak.

## Kenapa kita tetap memilih membaca ulang

Karena membaca ulang **terasa** lebih enak. Teksnya jadi makin familiar, dan
otak salah membaca kefamiliaran itu sebagai penguasaan. Ini yang disebut
*illusion of competence*.

- Membaca ulang → lancar, nyaman, cepat lupa.
- Mengingat dulu → tersendat, tidak nyaman, bertahan lama.

## Terapannya

1. Tutup catatan, tulis ulang poin utamanya dari kepala.
2. Baru buka catatan, dan tandai yang meleset.
3. Yang meleset itu yang jadi kartu — bukan seluruh isi catatan.

Kartu yang dibuat dari kesalahan sendiri jauh lebih berguna daripada kartu
yang dibuat dari daftar isi.`,
	},
	{
		Title:      "Beban kognitif: kenapa catatan yang terlalu rapi malah gagal",
		Domain:     "psychology",
		Categories: []string{"konsep", "kesalahan-umum"},
		CreatedAgo: 47,
		UpdatedAgo: 6,
		Body: `Memori kerja hanya muat sekitar empat potong informasi sekaligus. Semua
strategi belajar yang masuk akal berangkat dari batas itu.

## Tiga jenis beban

- **Intrinsik** — susahnya materi itu sendiri. Tidak bisa dikurangi, hanya
  bisa dipecah.
- **Ekstrinsik** — susahnya karena cara penyajian. Ini yang harus dibuang.
- **Germane** — usaha membangun pemahaman. Ini yang justru mau ditambah.

## Kenapa catatan rapi bisa jadi jebakan

Waktu yang habis untuk merapikan format adalah waktu yang tidak dipakai untuk
memahami. Catatan yang cantik memberi rasa selesai yang tidak dibayar dengan
pemahaman apa pun.

Aturan praktis yang dipakai di sini: **biaya menulis catatan harus mendekati
nol.** Satu baris sudah sah. Kalau menulis catatan terasa seperti pekerjaan,
catatannya tidak akan ditulis, dan yang hilang bukan kerapiannya — yang hilang
isinya.

> Catatan yang jelek tapi ada mengalahkan catatan sempurna yang tidak pernah
> jadi.`,
	},
	{
		Title:      "Distribusi normal dan aturan 68–95–99,7",
		Domain:     "math",
		Categories: []string{"konsep", "rumus"},
		CreatedAgo: 55,
		UpdatedAgo: 2,
		Body: `Distribusi normal muncul di mana-mana bukan karena alam menyukainya, tapi
karena **penjumlahan banyak pengaruh kecil yang saling bebas** cenderung
berbentuk begitu (teorema limit pusat).

## Bentuknya

Ditentukan penuh oleh dua angka: rata-rata (μ) dan simpangan baku (σ).

- μ menggeser kurva ke kiri atau ke kanan.
- σ melebarkan atau menyempitkan, tanpa mengubah bentuknya.

## Aturan empiris

| Rentang        | Proporsi data |
|----------------|---------------|
| μ ± 1σ         | ≈ 68%         |
| μ ± 2σ         | ≈ 95%         |
| μ ± 3σ         | ≈ 99,7%       |

Skor-z menjawab satu pertanyaan: *sejauh berapa simpangan baku sebuah nilai
dari rata-ratanya.*

    z = (x − μ) / σ

## Catatan yang sering dilupakan

Aturan di atas **hanya berlaku kalau datanya memang normal**. Data pendapatan,
waktu tunggu, dan ukuran kota tidak normal — miring ke kanan — dan memakai
aturan ini di sana menghasilkan kesimpulan yang percaya diri sekaligus salah.`,
	},
	{
		Title:      "Teorema Bayes dalam bentuk yang benar-benar dipakai",
		Domain:     "math",
		Categories: []string{"rumus", "studi-kasus"},
		CreatedAgo: 52,
		UpdatedAgo: 5,
		Body: `Rumusnya pendek, intuisinya yang mahal.

    P(A|B) = P(B|A) · P(A) / P(B)

Terjemahan bebas: **keyakinan awal, dikoreksi oleh bukti.**

## Contoh yang membuatnya klik

Sebuah tes penyakit punya sensitivitas 99% dan spesifisitas 99%. Penyakitnya
menyerang 1 dari 10.000 orang. Hasil tes seseorang positif. Berapa peluang dia
benar-benar sakit?

Dari 1.000.000 orang:

- 100 orang sakit → 99 positif benar.
- 999.900 orang sehat → 9.999 positif palsu.

Jadi dari 10.098 hasil positif, hanya 99 yang benar sakit — sekitar **1%**.

## Pelajarannya

Ketika kejadiannya langka, hasil positif dari tes yang bagus pun tetap
kemungkinan besar salah. Yang bikin orang keliru adalah mengabaikan angka
awal (*base rate*), bukan salah hitung.

> Bukti tidak menggantikan keyakinan awal. Bukti menggesernya.`,
	},
	{
		Title:      "p-value bukan peluang hipotesismu benar",
		Domain:     "math",
		Categories: []string{"kesalahan-umum", "konsep"},
		CreatedAgo: 40,
		UpdatedAgo: 9,
		Body: `Salah tafsir paling mahal di statistika terapan, dan tetap dicetak di jurnal
setiap minggu.

## Apa yang sebenarnya dihitung

p-value = peluang melihat data seekstrem ini **kalau hipotesis nol benar.**

Perhatikan arah syaratnya. Yang dihitung adalah P(data | H₀), bukan
P(H₀ | data). Menukar keduanya adalah kekeliruan yang sama persis dengan
mengira "semua ikan bisa berenang" berarti "semua yang berenang itu ikan".

## Yang tidak dikatakan p < 0,05

- Bukan berarti peluang hipotesis nol benar hanya 5%.
- Bukan berarti efeknya besar. Sampel besar membuat efek sepele jadi
  signifikan.
- Bukan berarti hasilnya bisa direplikasi.

## Yang lebih layak dilaporkan

Ukuran efek dan selang kepercayaannya. "Rata-rata naik 0,3 poin (95% CI:
0,1–0,5)" memberi tahu besar sekaligus ketidakpastiannya; "p = 0,04" tidak
memberi tahu keduanya.`,
	},
	{
		Title:      "Determinan nol artinya ruangnya runtuh",
		Domain:     "math",
		Categories: []string{"konsep"},
		CreatedAgo: 33,
		UpdatedAgo: 14,
		Body: `Determinan sering diajarkan sebagai prosedur hitung, padahal maknanya
geometris dan jauh lebih mudah diingat.

**Determinan adalah faktor perubahan luas (atau volume) oleh sebuah
transformasi linear.**

- det = 2 → semua luas jadi dua kali lipat.
- det = 1 → luas tetap; hanya diputar atau digeser.
- det = −1 → luas tetap, tapi orientasinya terbalik (dicerminkan).
- **det = 0 → luas jadi nol.** Bidang runtuh jadi garis, garis runtuh jadi
  titik.

## Kenapa det = 0 berarti tidak punya invers

Kalau seluruh bidang sudah diperas jadi satu garis, informasi ke mana titik
asal berada sudah hilang. Tidak ada transformasi yang bisa mengembalikannya —
itulah arti "tidak invertibel", dan kenapa sistem persamaannya tidak punya
solusi tunggal.`,
	},
	{
		Title:      "Turunan sebagai laju perubahan, bukan sebagai aturan",
		Domain:     "math",
		Categories: []string{"konsep", "rumus"},
		CreatedAgo: 29,
		UpdatedAgo: 17,
		Body: `Yang bikin kalkulus terasa kering adalah urutan pengajarannya: aturan dulu,
maknanya belakangan (kalau sempat).

Turunan menjawab satu pertanyaan: **seberapa cepat keluaran berubah ketika
masukannya digeser sedikit sekali.**

    f'(x) = lim (h→0) [ f(x+h) − f(x) ] / h

Itu kemiringan garis potong yang dua titiknya saling didekatkan sampai
berimpit — kemiringan garis singgung.

## Aturan yang cukup diingat

| Fungsi   | Turunan     |
|----------|-------------|
| xⁿ       | n·xⁿ⁻¹      |
| eˣ       | eˣ          |
| ln x     | 1/x         |
| sin x    | cos x       |
| cos x    | −sin x      |

## Kenapa turunan kedua penting

Turunan pertama bilang ke arah mana bergerak. Turunan kedua bilang apakah
gerakan itu sedang dipercepat atau diperlambat — dan itu yang membedakan
puncak dari lembah di titik yang turunannya nol.`,
	},
	{
		Title:      "Lingkaran kuint: kenapa urutannya bukan alfabet",
		Domain:     "music",
		Categories: []string{"konsep"},
		CreatedAgo: 44,
		UpdatedAgo: 4,
		Body: `Naik satu kuint sempurna dari C sampai kembali ke C: C – G – D – A – E – B –
F♯ – C♯ – G♯ – D♯ – A♯ – F – C.

Setiap langkah menambah **satu kres**, dan arah sebaliknya menambah satu mol.
Itu sebabnya urutan tanda mula bukan hafalan buta: urutannya mengikuti
lingkarannya sendiri.

## Kenapa kuint yang dipakai

Kuint sempurna adalah interval paling konsonan setelah oktaf — perbandingan
frekuensinya 3:2. Menumpuk interval paling stabil ini menghasilkan urutan nada
yang telinga rasakan paling "dekat", dan itulah yang membuat modulasi ke
tetangga di lingkaran terdengar mulus sementara lompat jauh terdengar
mengejutkan.

## Yang langsung berguna

- Tetangga sebelah kanan = dominan. Tetangga kiri = subdominan.
- Relatif minornya selalu tiga langkah searah jarum jam dari mayornya.
- Progresi yang bergerak berlawanan arah jarum jam hampir selalu terdengar
  "pulang".`,
	},
	{
		Title:      "Interval: mayor, minor, dan kenapa ada yang disebut sempurna",
		Domain:     "music",
		Categories: []string{"istilah"},
		CreatedAgo: 38,
		UpdatedAgo: 11,
		Body: `Interval dihitung **inklusif** — dari C ke E adalah terts, karena C, D, E ada
tiga huruf, bukan dua.

| Interval        | Jarak (semiton) |
|-----------------|-----------------|
| Prim sempurna   | 0               |
| Sekonde minor   | 1               |
| Sekonde mayor   | 2               |
| Terts minor     | 3               |
| Terts mayor     | 4               |
| Kuart sempurna  | 5               |
| Tritonus        | 6               |
| Kuint sempurna  | 7               |
| Sekst minor     | 8               |
| Sekst mayor     | 9               |
| Septim minor    | 10              |
| Septim mayor    | 11              |
| Oktaf           | 12              |

## Kenapa "sempurna"

Prim, kuart, kuint, dan oktaf tidak punya versi mayor/minor. Perbandingan
frekuensinya paling sederhana (1:1, 4:3, 3:2, 2:1) dan bunyinya netral —
tidak ceria, tidak sedih. Yang menentukan warna sebuah akor justru tertsnya.

Cara cepat mengenali di lagu: kuint sempurna = dua nada pembuka *Twinkle
Twinkle*; kuart sempurna = pembuka *Amazing Grace*.`,
	},
	{
		Title:      "Progresi ii–V–I dan kenapa telinga menganggapnya pulang",
		Domain:     "music",
		Categories: []string{"konsep", "latihan-soal"},
		CreatedAgo: 26,
		UpdatedAgo: 19,
		Body: `Di C mayor: Dm7 – G7 – Cmaj7.

## Mekanismenya

G7 memuat tritonus antara B dan F. Tritonus itu tegang, dan punya arah
resolusi yang hampir wajib: B naik ke C, F turun ke E. Keduanya adalah nada
akor tonik. Jadi ketegangan itu tidak sekadar hilang — ia diarahkan.

Dm7 di depannya menyiapkan G7 lewat gerak bas turun kuint: D → G → C.

## Latihan yang dipakai

1. Mainkan di semua dua belas nada, searah lingkaran kuint.
2. Voicing dulu tanpa nada dasar (tangan kanan saja), baru tambahkan bas.
3. Dengarkan gerak suaranya: harusnya ada nada yang tidak pindah sama sekali.

Yang bikin progresi ini terdengar khas jazz bukan akornya, tapi **gerak suara
yang minimal** — sebisa mungkin satu-dua nada saja yang bergerak antar akor.`,
	},
	{
		Title:      "Goroutine dan channel: kapan justru tidak dipakai",
		Domain:     "coding",
		Categories: []string{"konsep", "kesalahan-umum"},
		CreatedAgo: 36,
		UpdatedAgo: 7,
		Body: `Concurrency di Go murah, dan itu justru masalahnya: orang memakainya untuk hal
yang tidak perlu bersamaan.

## Aturan yang dipakai

- Kalau tugasnya berurutan, tulis berurutan. Goroutine tidak membuatnya lebih
  cepat, cuma lebih sulit dibaca.
- Yang memulai goroutine bertanggung jawab menghentikannya. Goroutine tanpa
  jalan keluar adalah kebocoran.
- Channel untuk **memindahkan kepemilikan data**, mutex untuk **melindungi
  state**. Memakai channel sebagai pengganti mutex biasanya menghasilkan kode
  yang lebih rumit tanpa jaminan tambahan.

` + "```go\n" +
			"// Salah: goroutine tanpa cara berhenti.\n" +
			"go func() {\n" +
			"    for {\n" +
			"        poll()\n" +
			"    }\n" +
			"}()\n" +
			"\n" +
			"// Benar: pemanggil bisa menghentikannya.\n" +
			"go func() {\n" +
			"    for {\n" +
			"        select {\n" +
			"        case <-ctx.Done():\n" +
			"            return\n" +
			"        case <-tick.C:\n" +
			"            poll()\n" +
			"        }\n" +
			"    }\n" +
			"}()\n" +
			"```" + `

## Deteksi dini

` + "`go test -race`" + ` menemukan sebagian besar data race yang sempat terjadi
selama tes berjalan. Yang tidak pernah dieksekusi tidak akan ketahuan — jadi
race detector itu jaring, bukan bukti.`,
	},
	{
		Title:      "Index Postgres: B-tree, GIN, dan trigram",
		Domain:     "coding",
		Categories: []string{"konsep", "studi-kasus"},
		CreatedAgo: 31,
		UpdatedAgo: 12,
		Body: `Index yang salah jenis sama tidak bergunanya dengan tidak punya index, tapi
tetap memperlambat setiap penulisan.

## Kapan memakai apa

- **B-tree** — default. Kesamaan, rentang, ` + "`ORDER BY`" + `. Hampir semua
  kolom yang di-filter memakai ini.
- **GIN** — untuk nilai majemuk: array, ` + "`jsonb`" + `, ` + "`tsvector`" + `.
  Satu baris bisa masuk ke banyak entri index.
- **Trigram (` + "`gin_trgm_ops`" + `)** — untuk ` + "`ILIKE '%kata%'`" + `.
  B-tree tidak bisa menolong pencarian yang diawali wildcard; trigram bisa.

## Yang sering keliru

Index majemuk ` + "`(a, b)`" + ` membantu query yang menyaring ` + "`a`" + `, atau
` + "`a` dan `b`" + ` sekaligus — tapi **tidak** membantu query yang hanya
menyaring ` + "`b`" + `. Urutan kolom bukan detail kosmetik.

## Cara memastikan

` + "```sql\n" +
			"EXPLAIN (ANALYZE, BUFFERS)\n" +
			"SELECT * FROM notes\n" +
			"WHERE user_id = $1 AND title ILIKE '%bayes%';\n" +
			"```" + `

Kalau yang muncul ` + "`Seq Scan`" + ` di tabel besar, indexnya tidak dipakai —
dan alasannya biasanya tipe data yang tidak cocok, bukan indexnya yang kurang.`,
	},
	{
		Title:      "Tingkat isolasi transaksi, dengan contoh yang pernah menggigit",
		Domain:     "coding",
		Categories: []string{"konsep", "studi-kasus"},
		CreatedAgo: 22,
		UpdatedAgo: 21,
		Body: `Default Postgres adalah **Read Committed**, dan itu lebih longgar daripada
yang biasanya diasumsikan orang.

| Tingkat          | Dirty read | Non-repeatable read | Phantom |
|------------------|------------|---------------------|---------|
| Read Committed   | tidak      | **bisa**            | **bisa**|
| Repeatable Read  | tidak      | tidak               | tidak¹  |
| Serializable     | tidak      | tidak               | tidak   |

¹ Postgres memang mencegahnya di tingkat ini, berbeda dari standar SQL.

## Contoh yang menggigit

Cek kuota lalu menyisipkan baris, di Read Committed:

1. Transaksi A menghitung 4.999 catatan, batasnya 5.000 → lolos.
2. Transaksi B melakukan hal yang sama, bersamaan → juga lolos.
3. Keduanya menyisipkan. Sekarang ada 5.001.

Baca-lalu-tulis tanpa penguncian bukan pengecekan; itu tebakan yang biasanya
benar. Perbaikannya: kunci barisnya, pakai batasan di level basis data, atau
naikkan isolasinya ke Serializable dan tangani kegagalan serialisasi dengan
mengulang transaksi.`,
	},
	{
		Title:      "Context di Go: dioper, bukan disimpan",
		Domain:     "coding",
		Categories: []string{"kesalahan-umum"},
		CreatedAgo: 18,
		UpdatedAgo: 24,
		Body: `` + "`context.Context`" + ` adalah parameter pertama, bukan field struct.

## Aturannya

1. Oper sebagai argumen pertama: ` + "`func Do(ctx context.Context, ...)`" + `.
2. Jangan simpan di struct. Context punya masa hidup satu permintaan; struct
   biasanya tidak.
3. Jangan pernah mengoper ` + "`nil`" + `. Kalau belum tahu mau pakai apa,
   ` + "`context.TODO()`" + ` menyatakan itu dengan jujur.
4. Nilai di dalam context untuk data lintas-permintaan seperti request ID —
   bukan untuk parameter opsional.

## Yang paling sering bocor

Setiap ` + "`context.WithCancel`" + ` dan ` + "`WithTimeout`" + ` mengembalikan
fungsi ` + "`cancel`" + ` yang **harus** dipanggil, meskipun operasinya sudah
selesai lebih dulu. Lupa memanggilnya membuat context induk menahan anaknya
sampai ia sendiri selesai — dan di server yang berumur panjang, itu kebocoran
yang tumbuh pelan sampai terlihat sebagai memori yang naik terus.`,
	},
	{
		Title:      "Collocation Inggris yang sering salah",
		Domain:     "english",
		Categories: []string{"kesalahan-umum", "istilah"},
		CreatedAgo: 25,
		UpdatedAgo: 8,
		Body: `Kesalahan yang paling menandai penutur non-asli biasanya bukan tata bahasa,
tapi pasangan kata yang tidak lazim.

| Salah              | Benar               |
|--------------------|---------------------|
| do a mistake       | **make** a mistake  |
| make homework      | **do** homework     |
| take a decision*   | **make** a decision |
| say me             | **tell** me         |
| discuss about      | **discuss** (tanpa about) |
| explain me         | **explain to** me   |
| research*s*        | research (tak terhitung) |
| informations       | information (tak terhitung) |

\* "take a decision" lazim di Inggris British formal, tapi "make" lebih aman.

## Pola yang menolong

- **make** → menghasilkan sesuatu yang baru: a decision, a mistake, progress,
  a suggestion.
- **do** → melakukan pekerjaan atau tugas: homework, the dishes, business,
  research.

Menghafal daftar tidak seampuh mengoleksi yang kita sendiri salah pakai.`,
	},
	{
		Title:      "Phrasal verb: get, put, take",
		Domain:     "english",
		Categories: []string{"istilah", "latihan-soal"},
		CreatedAgo: 20,
		UpdatedAgo: 16,
		Body: `Phrasal verb tidak bisa ditebak dari kata dasarnya, jadi diperlakukan seperti
kosakata baru — bukan seperti tata bahasa.

## get

- **get by** — bertahan pas-pasan. *We can get by on very little.*
- **get over** — pulih dari sesuatu. *It took a month to get over the flu.*
- **get around to** — akhirnya sempat mengerjakan. *I finally got around to it.*

## put

- **put off** — menunda. *Don't put it off again.*
- **put up with** — menoleransi. *She puts up with a lot.*
- **put down to** — menganggap disebabkan oleh. *I put it down to luck.*

## take

- **take after** — mirip (keluarga). *He takes after his mother.*
- **take on** — menerima tanggung jawab baru. *She took on two more projects.*
- **take in** — mencerna informasi. *That's a lot to take in.*

Yang dipisah dan tidak: *put off the meeting* dan *put the meeting off* dua-duanya
benar, tapi kalau objeknya kata ganti wajib di tengah — *put it off*, bukan
*put off it*.`,
	},
	{
		Title:      "Membaca cepat itu mitos; membaca ulang lebih parah",
		Domain:     "general",
		Categories: []string{"ringkasan-buku", "kesalahan-umum"},
		CreatedAgo: 15,
		UpdatedAgo: 10,
		Body: `Dua kebiasaan belajar paling populer, dua-duanya lemah.

## Membaca cepat

Kecepatan baca naik dengan mengorbankan pemahaman, dan pertukarannya tidak
lembut — di atas sekitar 500 kata per menit, pemahaman jatuh tajam. Yang
dijual sebagai teknik membaca cepat biasanya adalah *skimming*, yang memang
berguna, tapi bukan membaca.

## Membaca ulang

Terasa efektif, hampir tidak menambah retensi. Alasannya sama dengan catatan
di [Efek pengujian]: kefamiliaran disalahartikan sebagai penguasaan.

## Yang berhasil

1. **Baca sekali, dengan pertanyaan di kepala.**
2. **Tutup bukunya, tulis jawabannya.**
3. **Buka lagi, tandai yang meleset.**
4. Yang meleset jadi kartu.

Lebih lambat per halaman, jauh lebih murah per hal yang benar-benar diingat.`,
	},
	{
		Title:      "Format catatan rapat yang bertahan seminggu kemudian",
		Domain:     "general",
		Categories: []string{"konsep"},
		CreatedAgo: 12,
		UpdatedAgo: 13,
		Body: `Catatan rapat gagal bukan karena kurang lengkap, tapi karena tidak bisa
dijawab pertanyaan "jadi saya harus apa" tanpa membaca ulang semuanya.

## Empat blok

**Keputusan.** Apa yang sudah diputuskan, dan oleh siapa. Satu baris per
keputusan.

**Aksi.** Siapa, apa, kapan. Tanpa nama dan tanggal, itu bukan aksi — itu
harapan.

**Terbuka.** Yang belum diputuskan dan siapa yang menunggu jawabannya.

**Konteks.** Alasan di balik keputusan. Ini bagian yang paling sering
dilewatkan dan paling mahal ketika hilang — enam bulan lagi, yang dicari orang
adalah *kenapa*, bukan *apa*.

## Ditulis saat rapat, bukan setelahnya

Catatan yang dirapikan nanti malam tidak pernah dirapikan.`,
	},
	{
		Title:      "Tentang konsistensi",
		Domain:     "general",
		Categories: []string{"kutipan"},
		CreatedAgo: 9,
		UpdatedAgo: 20,
		Body: `> Kita adalah apa yang berulang kali kita lakukan. Keunggulan, kalau begitu,
> bukan sebuah perbuatan, melainkan kebiasaan.

Sering dikutip sebagai Aristoteles, sebenarnya parafrase Will Durant di
*The Story of Philosophy* (1926) atas *Nicomachean Ethics*.

Dipakai di sini bukan sebagai motivasi, tapi sebagai pengingat teknis: sistem
yang menuntut intensitas akan ditinggalkan, sistem yang menuntut sedikit tapi
sering akan bertahan.`,
	},
	{
		Title:      "Draf: struktur ulang folder catatan",
		Domain:     "general",
		Categories: []string{},
		CreatedAgo: 30,
		UpdatedAgo: 23,
		Deleted:    true,
		Body: `Ide setengah jadi soal memecah kategori jadi dua tingkat. Ditunda —
kategorinya baru delapan, hierarki di jumlah segini cuma menambah keputusan
tanpa menambah kejelasan.`,
	},
	{
		Title:      "Coretan integral parsial",
		Domain:     "math",
		Categories: []string{"rumus"},
		CreatedAgo: 34,
		UpdatedAgo: 27,
		Deleted:    true,
		Body: `∫u dv = uv − ∫v du

Sudah ditulis ulang lebih rapi di catatan turunan dan integral.`,
	},
}

// demoCard is one flashcard plus the state of its schedule.
//
// Due is in days from today: negative is overdue, 0 is due today, positive is
// scheduled ahead. It is ignored when Mastered is set — a mastered card has no
// next review date at all, which is the schema's "not scheduled".
type demoCard struct {
	Front      string
	Back       string
	Domain     string
	Categories []string
	Stage      int
	Due        int
	Lapses     int
	Mastered   bool
	CreatedAgo int
	Deleted    bool
}

var demoCards = []demoCard{
	// --- Psikologi belajar -------------------------------------------------
	{Front: "Apa yang dimaksud efek pengujian (testing effect)?",
		Back:   "Mencoba memanggil kembali informasi memperkuat ingatan lebih besar daripada membacanya ulang, terutama untuk retensi jangka panjang.",
		Domain: "psychology", Categories: []string{"konsep"},
		Stage: 4, Due: -1, CreatedAgo: 61},
	{Front: "Kenapa membaca ulang terasa efektif padahal tidak?",
		Back:   "Karena teksnya jadi makin familiar, dan otak salah membaca kefamiliaran itu sebagai penguasaan — illusion of competence.",
		Domain: "psychology", Categories: []string{"konsep", "kesalahan-umum"},
		Stage: 3, Due: 0, Lapses: 1, CreatedAgo: 59},
	{Front: "Berapa kira-kira kapasitas memori kerja?",
		Back:   "Sekitar empat potong informasi sekaligus (Cowan), bukan tujuh seperti angka Miller yang lebih tua.",
		Domain: "psychology", Categories: []string{"konsep"},
		Stage: 5, Due: 12, CreatedAgo: 55},
	{Front: "Tiga jenis beban kognitif?",
		Back:   "Intrinsik (susahnya materi), ekstrinsik (susahnya penyajian), germane (usaha membangun pemahaman). Yang dibuang hanya yang ekstrinsik.",
		Domain: "psychology", Categories: []string{"konsep", "istilah"},
		Stage: 2, Due: 0, CreatedAgo: 47},
	{Front: "Apa itu desirable difficulty?",
		Back:   "Kesulitan yang memperlambat proses belajar saat berlangsung tapi meningkatkan retensi jangka panjang — misalnya jeda, pengacakan, dan memanggil ingatan tanpa bantuan.",
		Domain: "psychology", Categories: []string{"istilah"},
		Stage: 3, Due: -2, CreatedAgo: 44},
	{Front: "Apa yang disebut interleaving?",
		Back:   "Mengacak jenis soal dalam satu sesi alih-alih mengelompokkannya. Terasa lebih sulit, hasil transfernya lebih baik.",
		Domain: "psychology", Categories: []string{"istilah"},
		Stage: 1, Due: 1, CreatedAgo: 21},
	{Front: "Kurva lupa Ebbinghaus menunjukkan apa?",
		Back:   "Penurunan retensi paling tajam terjadi dalam jam-jam pertama setelah belajar, lalu melandai. Pengulangan berjeda meratakan kurvanya.",
		Domain: "psychology", Categories: []string{"konsep"},
		Stage: 6, Due: 61, CreatedAgo: 68},
	{Front: "Kenapa lupa satu kali tidak mengembalikan kartu ke tahap nol?",
		Back:   "Karena menghukum satu kesalahan dengan mengulang semuanya dari awal membuat orang berhenti. Turun satu anak tangga sudah cukup untuk memperbaiki jadwalnya.",
		Domain: "psychology", Categories: []string{"konsep"},
		Stage: 2, Due: -3, Lapses: 2, CreatedAgo: 66},

	// --- Matematika --------------------------------------------------------
	{Front: "Aturan 68–95–99,7 berlaku untuk distribusi apa?",
		Back:   "Distribusi normal. Sekitar 68% data dalam μ ± 1σ, 95% dalam μ ± 2σ, 99,7% dalam μ ± 3σ.",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 4, Due: -1, CreatedAgo: 55},
	{Front: "Tuliskan rumus skor-z.",
		Back:   "z = (x − μ) / σ — jarak sebuah nilai dari rata-rata, diukur dalam satuan simpangan baku.",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 5, Due: 22, CreatedAgo: 54},
	{Front: "Tuliskan teorema Bayes.",
		Back:   "P(A|B) = P(B|A) · P(A) / P(B). Keyakinan awal dikoreksi oleh bukti.",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 3, Due: 0, CreatedAgo: 52},
	{Front: "Kenapa tes 99% akurat untuk penyakit langka tetap sering salah saat positif?",
		Back:   "Karena base rate-nya kecil: jumlah positif palsu dari populasi sehat yang besar jauh melebihi positif benar dari populasi sakit yang kecil.",
		Domain: "math", Categories: []string{"studi-kasus", "kesalahan-umum"},
		Stage: 2, Due: 0, CreatedAgo: 52},
	{Front: "Apa arti p-value secara tepat?",
		Back:   "Peluang mengamati data seekstrem ini kalau hipotesis nol benar — P(data | H₀), bukan P(H₀ | data).",
		Domain: "math", Categories: []string{"kesalahan-umum"},
		Stage: 3, Due: -1, Lapses: 1, CreatedAgo: 40},
	{Front: "Kenapa ukuran efek lebih layak dilaporkan daripada p-value?",
		Back:   "Karena p-value tidak memberi tahu besarnya efek maupun ketidakpastiannya; sampel besar membuat efek sepele jadi signifikan.",
		Domain: "math", Categories: []string{"konsep"},
		Stage: 1, Due: 2, CreatedAgo: 39},
	{Front: "Apa arti determinan bernilai nol?",
		Back:   "Transformasinya meruntuhkan ruang ke dimensi yang lebih rendah, sehingga tidak punya invers dan sistemnya tidak bersolusi tunggal.",
		Domain: "math", Categories: []string{"konsep"},
		Stage: 4, Due: 8, CreatedAgo: 33},
	{Front: "Apa arti determinan bernilai negatif?",
		Back:   "Luas atau volumenya berubah sebesar nilai mutlaknya, dan orientasinya terbalik — ruangnya dicerminkan.",
		Domain: "math", Categories: []string{"konsep"},
		Stage: 2, Due: -2, CreatedAgo: 32},
	{Front: "Definisi turunan sebagai limit?",
		Back:   "f'(x) = lim(h→0) [f(x+h) − f(x)] / h — kemiringan garis potong yang kedua titiknya dirapatkan sampai berimpit.",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 3, Due: 4, CreatedAgo: 29},
	{Front: "Turunan dari ln x?",
		Back:   "1/x",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 6, Due: 88, CreatedAgo: 29},
	{Front: "Turunan dari cos x?",
		Back:   "−sin x",
		Domain: "math", Categories: []string{"rumus"},
		Mastered: true, Stage: 6, CreatedAgo: 70},
	{Front: "Apa yang diberitahu turunan kedua?",
		Back:   "Apakah lajunya sedang dipercepat atau diperlambat — itu yang membedakan puncak dari lembah pada titik yang turunan pertamanya nol.",
		Domain: "math", Categories: []string{"konsep"},
		Stage: 2, Due: 1, CreatedAgo: 28},
	{Front: "Rumus integral parsial?",
		Back:   "∫u dv = uv − ∫v du",
		Domain: "math", Categories: []string{"rumus"},
		Mastered: true, Stage: 6, CreatedAgo: 71},
	{Front: "Kenapa aturan empiris tidak boleh dipakai pada data pendapatan?",
		Back:   "Karena distribusinya miring ke kanan, bukan normal. Aturan 68–95–99,7 hanya berlaku untuk distribusi normal.",
		Domain: "math", Categories: []string{"kesalahan-umum"},
		Stage: 1, Due: 0, CreatedAgo: 26},
	{Front: "Teorema limit pusat menyatakan apa?",
		Back:   "Rata-rata dari banyak sampel acak yang saling bebas mendekati distribusi normal, apa pun bentuk distribusi asalnya.",
		Domain: "math", Categories: []string{"konsep"},
		Stage: 4, Due: 15, CreatedAgo: 50},

	// --- Musik -------------------------------------------------------------
	{Front: "Berapa semiton dalam kuint sempurna?",
		Back:   "Tujuh semiton. Perbandingan frekuensinya 3:2.",
		Domain: "music", Categories: []string{"istilah"},
		Stage: 5, Due: 27, CreatedAgo: 44},
	{Front: "Berapa semiton dalam terts minor?",
		Back:   "Tiga semiton.",
		Domain: "music", Categories: []string{"istilah"},
		Stage: 3, Due: 0, CreatedAgo: 43},
	{Front: "Berapa semiton dalam tritonus?",
		Back:   "Enam semiton — separuh oktaf, dan interval paling tegang dalam sistem tonal.",
		Domain: "music", Categories: []string{"istilah"},
		Stage: 2, Due: -1, CreatedAgo: 42},
	{Front: "Kenapa prim, kuart, kuint, dan oktaf disebut sempurna?",
		Back:   "Karena perbandingan frekuensinya paling sederhana (1:1, 4:3, 3:2, 2:1) dan bunyinya netral — tidak mayor, tidak minor.",
		Domain: "music", Categories: []string{"konsep"},
		Stage: 3, Due: 5, CreatedAgo: 38},
	{Front: "Sebutkan urutan lingkaran kuint dari C, searah jarum jam.",
		Back:   "C – G – D – A – E – B – F♯ – C♯ – G♯ – D♯ – A♯ – F – kembali ke C. Tiap langkah menambah satu kres.",
		Domain: "music", Categories: []string{"konsep"},
		Stage: 2, Due: 0, Lapses: 1, CreatedAgo: 44},
	{Front: "Di mana letak relatif minor sebuah tangga nada mayor?",
		Back:   "Tiga langkah searah jarum jam pada lingkaran kuint, atau terts minor di bawah nada dasarnya. Relatif minor C mayor adalah A minor.",
		Domain: "music", Categories: []string{"konsep"},
		Stage: 1, Due: 1, CreatedAgo: 37},
	{Front: "Apa akor ii–V–I di C mayor?",
		Back:   "Dm7 – G7 – Cmaj7.",
		Domain: "music", Categories: []string{"konsep"},
		Stage: 4, Due: 10, CreatedAgo: 26},
	{Front: "Kenapa G7 terdengar 'ingin pulang' ke C?",
		Back:   "Tritonus B–F di dalamnya punya arah resolusi yang kuat: B naik ke C, F turun ke E — dua-duanya nada akor tonik.",
		Domain: "music", Categories: []string{"konsep"},
		Stage: 2, Due: -2, CreatedAgo: 25},
	{Front: "Nada apa saja dalam akor Cmaj7?",
		Back:   "C – E – G – B.",
		Domain: "music", Categories: []string{"istilah"},
		Stage: 3, Due: 3, CreatedAgo: 24},
	{Front: "Apa beda akor dominan tujuh dengan mayor tujuh?",
		Back:   "Dominan tujuh memakai septim minor (C–E–G–B♭), mayor tujuh memakai septim mayor (C–E–G–B). Yang pertama tegang, yang kedua tenang.",
		Domain: "music", Categories: []string{"istilah"},
		Stage: 1, Due: 0, CreatedAgo: 23},
	{Front: "Interval pembuka lagu Twinkle Twinkle Little Star?",
		Back:   "Kuint sempurna (C ke G).",
		Domain: "music", Categories: []string{"latihan-soal"},
		Mastered: true, Stage: 6, CreatedAgo: 60},

	// --- Coding ------------------------------------------------------------
	{Front: "Kapan memakai channel dan kapan memakai mutex di Go?",
		Back:   "Channel untuk memindahkan kepemilikan data antar goroutine; mutex untuk melindungi state yang dipakai bersama. Memakai channel sebagai pengganti mutex biasanya cuma menambah rumit.",
		Domain: "coding", Categories: []string{"konsep"},
		Stage: 3, Due: 0, CreatedAgo: 36},
	{Front: "Siapa yang bertanggung jawab menghentikan sebuah goroutine?",
		Back:   "Yang memulainya. Goroutine tanpa jalan keluar adalah kebocoran yang tidak akan pernah dilaporkan siapa pun.",
		Domain: "coding", Categories: []string{"kesalahan-umum"},
		Stage: 2, Due: -1, CreatedAgo: 35},
	{Front: "Kenapa context.Context tidak disimpan di dalam struct?",
		Back:   "Masa hidupnya satu permintaan, sedangkan struct biasanya lebih panjang umurnya. Context dioper sebagai argumen pertama.",
		Domain: "coding", Categories: []string{"kesalahan-umum"},
		Stage: 4, Due: 9, CreatedAgo: 18},
	{Front: "Apa akibatnya lupa memanggil cancel dari context.WithTimeout?",
		Back:   "Context induk menahan anaknya sampai ia sendiri selesai — kebocoran yang tumbuh pelan dan terlihat sebagai memori yang naik terus.",
		Domain: "coding", Categories: []string{"kesalahan-umum"},
		Stage: 2, Due: 0, Lapses: 1, CreatedAgo: 18},
	{Front: "Index jenis apa yang menolong ILIKE '%kata%'?",
		Back:   "Index trigram (GIN dengan gin_trgm_ops). B-tree tidak bisa dipakai untuk pola yang diawali wildcard.",
		Domain: "coding", Categories: []string{"konsep"},
		Stage: 3, Due: 6, CreatedAgo: 31},
	{Front: "Index majemuk (a, b) menolong query yang menyaring apa saja?",
		Back:   "Yang menyaring a, atau a dan b sekaligus. Tidak menolong query yang hanya menyaring b — urutan kolom menentukan.",
		Domain: "coding", Categories: []string{"konsep", "kesalahan-umum"},
		Stage: 2, Due: -1, CreatedAgo: 30},
	{Front: "Apa tingkat isolasi transaksi default di Postgres?",
		Back:   "Read Committed. Lebih longgar dari yang biasanya diasumsikan: non-repeatable read dan phantom read masih mungkin.",
		Domain: "coding", Categories: []string{"konsep"},
		Stage: 4, Due: 18, CreatedAgo: 22},
	{Front: "Kenapa 'cek kuota lalu insert' tidak aman di Read Committed?",
		Back:   "Dua transaksi bisa membaca angka yang sama sebelum salah satunya menulis, lalu keduanya lolos. Baca-lalu-tulis tanpa penguncian adalah tebakan, bukan pengecekan.",
		Domain: "coding", Categories: []string{"studi-kasus"},
		Stage: 1, Due: 0, CreatedAgo: 22},
	{Front: "Apa yang tidak bisa ditemukan oleh go test -race?",
		Back:   "Race pada jalur kode yang tidak pernah dieksekusi selama tes berjalan. Race detector itu jaring, bukan bukti.",
		Domain: "coding", Categories: []string{"konsep"},
		Stage: 3, Due: 2, CreatedAgo: 34},
	{Front: "Kenapa RLS butuh FORCE ROW LEVEL SECURITY?",
		Back:   "Karena pemilik tabel melewati policy-nya sendiri secara default. Tanpa FORCE, semua policy jadi tidak aktif sementara tes naif tetap lulus.",
		Domain: "coding", Categories: []string{"konsep", "studi-kasus"},
		Stage: 2, Due: -3, CreatedAgo: 20},
	{Front: "Apa beda EXPLAIN dengan EXPLAIN ANALYZE?",
		Back:   "EXPLAIN hanya menampilkan rencana yang diperkirakan; EXPLAIN ANALYZE benar-benar menjalankan query dan menampilkan waktu serta jumlah baris sebenarnya.",
		Domain: "coding", Categories: []string{"istilah"},
		Stage: 5, Due: 31, CreatedAgo: 45},
	{Front: "Kenapa pool koneksi dibatasi pada instans Postgres bersama?",
		Back:   "Karena satu aplikasi dengan pool tak terbatas bisa menghabiskan seluruh slot koneksi dan menjatuhkan setiap proyek lain di mesin yang sama.",
		Domain: "coding", Categories: []string{"konsep"},
		Stage: 3, Due: 7, CreatedAgo: 19},

	// --- Bahasa Inggris ----------------------------------------------------
	{Front: "make a mistake atau do a mistake?",
		Back:   "make a mistake. 'make' dipakai untuk sesuatu yang dihasilkan: a decision, progress, a suggestion.",
		Domain: "english", Categories: []string{"kesalahan-umum"},
		Stage: 4, Due: -1, CreatedAgo: 25},
	{Front: "do homework atau make homework?",
		Back:   "do homework. 'do' dipakai untuk pekerjaan atau tugas: the dishes, business, research.",
		Domain: "english", Categories: []string{"kesalahan-umum"},
		Stage: 5, Due: 25, CreatedAgo: 25},
	{Front: "Kenapa 'discuss about' salah?",
		Back:   "Karena 'discuss' sudah transitif: discuss the plan, bukan discuss about the plan.",
		Domain: "english", Categories: []string{"kesalahan-umum"},
		Stage: 2, Due: 0, CreatedAgo: 24},
	{Front: "Apa arti 'put up with'?",
		Back:   "Menoleransi sesuatu yang tidak menyenangkan. *She puts up with a lot.*",
		Domain: "english", Categories: []string{"istilah"},
		Stage: 3, Due: 3, CreatedAgo: 20},
	{Front: "Apa arti 'get around to'?",
		Back:   "Akhirnya sempat mengerjakan sesuatu yang tertunda. *I finally got around to it.*",
		Domain: "english", Categories: []string{"istilah"},
		Stage: 1, Due: 0, CreatedAgo: 20},
	{Front: "Apa arti 'take after'?",
		Back:   "Mirip dengan anggota keluarga, biasanya orang tua. *He takes after his mother.*",
		Domain: "english", Categories: []string{"istilah"},
		Stage: 2, Due: 1, CreatedAgo: 19},
	{Front: "Benar yang mana: 'put off it' atau 'put it off'?",
		Back:   "'put it off'. Kalau objeknya kata ganti, ia wajib berada di antara kata kerja dan partikelnya.",
		Domain: "english", Categories: []string{"latihan-soal"},
		Stage: 3, Due: -2, Lapses: 1, CreatedAgo: 19},
	{Front: "Kenapa 'informations' salah?",
		Back:   "Karena information adalah kata benda tak terhitung. Untuk menyatakan jumlah: a piece of information, two pieces of information.",
		Domain: "english", Categories: []string{"kesalahan-umum"},
		Mastered: true, Stage: 6, CreatedAgo: 58},

	// --- Pengetahuan umum --------------------------------------------------
	{Front: "Kenapa membaca cepat mengorbankan pemahaman?",
		Back:   "Di atas sekitar 500 kata per menit pemahaman jatuh tajam. Yang dijual sebagai membaca cepat umumnya skimming — berguna, tapi bukan membaca.",
		Domain: "general", Categories: []string{"ringkasan-buku"},
		Stage: 2, Due: 0, CreatedAgo: 15},
	{Front: "Empat blok catatan rapat yang bertahan?",
		Back:   "Keputusan, Aksi (siapa–apa–kapan), Terbuka, dan Konteks. Konteks yang paling sering dilewatkan dan paling mahal saat hilang.",
		Domain: "general", Categories: []string{"konsep"},
		Stage: 3, Due: 4, CreatedAgo: 12},
	{Front: "Siapa sebenarnya penulis kutipan 'we are what we repeatedly do'?",
		Back:   "Will Durant, dalam The Story of Philosophy (1926), memparafrase Aristoteles — bukan Aristoteles sendiri.",
		Domain: "general", Categories: []string{"kutipan"},
		Stage: 4, Due: 13, CreatedAgo: 9},
	{Front: "Kenapa sistem belajar yang menuntut intensitas cenderung ditinggalkan?",
		Back:   "Karena biayanya harus dibayar penuh setiap kali. Sistem yang menuntut sedikit tapi sering bertahan justru karena murah untuk dilanjutkan.",
		Domain: "general", Categories: []string{"konsep"},
		Stage: 2, Due: -1, CreatedAgo: 9},

	// --- Terhapus ----------------------------------------------------------
	{Front: "Kartu duplikat soal skor-z",
		Back:   "z = (x − μ) / σ",
		Domain: "math", Categories: []string{"rumus"},
		Stage: 1, Due: 3, CreatedAgo: 41, Deleted: true},
	{Front: "Catatan sementara: cek lagi definisi interleaving",
		Back:   "Sudah digantikan kartu yang lebih jelas.",
		Domain: "psychology", Categories: []string{},
		Stage: 0, Due: 1, CreatedAgo: 28, Deleted: true},
}

// demoSet is a saved practice set (D-075). Fixed sets carry an explicit card
// list, drawn here from the cards of the domains named; random sets carry a
// question count and draw at run time.
type demoSet struct {
	Title       string
	Description string
	Selection   string // "fixed" | "random"
	Format      string // "recall" | "choice"
	Domains     []string
	Categories  []string
	Count       int32 // random only
	TimeLimit   int32 // 0 for none
	CardCount   int   // fixed only: how many of the matching cards to pin
	CreatedAgo  int
	Runs        []demoRun
}

// demoRun is one past sitting. Correct is how many of Total were answered
// "ingat"; Open marks the single unfinished run, which is what the detail
// screen offers to resume.
type demoRun struct {
	DaysAgo  int
	Total    int
	Correct  int
	Open     bool
	Answered int // open runs only: how many questions already answered
}

var demoSets = []demoSet{
	{
		Title:       "Statistika Dasar — hafalan cepat",
		Description: "Rumus dan definisi yang harus keluar tanpa berpikir.",
		Selection:   "random", Format: "recall",
		Domains: []string{"math"}, Categories: nil,
		Count: 12, TimeLimit: 10, CreatedAgo: 49,
		Runs: []demoRun{
			{DaysAgo: 44, Total: 12, Correct: 7},
			{DaysAgo: 37, Total: 12, Correct: 9},
			{DaysAgo: 23, Total: 12, Correct: 10},
			{DaysAgo: 11, Total: 12, Correct: 11},
			{DaysAgo: 3, Total: 12, Correct: 12},
		},
	},
	{
		Title:       "Istilah Psikologi Kognitif",
		Description: "Pilihan ganda, untuk mengecek pengenalan istilah sebelum membaca lebih jauh.",
		Selection:   "random", Format: "choice",
		Domains: []string{"psychology"}, Categories: nil,
		Count: 8, TimeLimit: 0, CreatedAgo: 35,
		Runs: []demoRun{
			{DaysAgo: 30, Total: 8, Correct: 5},
			{DaysAgo: 18, Total: 8, Correct: 6},
			{DaysAgo: 6, Total: 8, Correct: 8},
		},
	},
	{
		Title:       "Teori Musik: interval & akor",
		Description: "Set tetap. Isinya tidak berubah supaya hasil antar sesi bisa dibandingkan.",
		Selection:   "fixed", Format: "choice",
		Domains: []string{"music"}, Categories: nil,
		CardCount: 9, TimeLimit: 0, CreatedAgo: 28,
		Runs: []demoRun{
			{DaysAgo: 24, Total: 9, Correct: 5},
			{DaysAgo: 13, Total: 9, Correct: 7},
			{DaysAgo: 2, Total: 9, Correct: 8},
			{DaysAgo: 0, Total: 9, Open: true, Answered: 4},
		},
	},
	{
		Title:       "Go & Postgres — konsep inti",
		Description: "Yang sering ditanya saat review kode, dan yang sering saya keliru sendiri.",
		Selection:   "fixed", Format: "recall",
		Domains: []string{"coding"}, Categories: nil,
		CardCount: 10, TimeLimit: 15, CreatedAgo: 21,
		Runs: []demoRun{
			{DaysAgo: 16, Total: 10, Correct: 6},
			{DaysAgo: 5, Total: 10, Correct: 9},
		},
	},
	{
		Title:       "Kesalahan yang sering saya ulangi",
		Description: "Lintas domain, disaring lewat kategori. Isinya tumbuh sendiri tiap kali saya keliru.",
		Selection:   "random", Format: "recall",
		Domains: nil, Categories: []string{"kesalahan-umum"},
		Count: 8, TimeLimit: 0, CreatedAgo: 14,
		Runs: []demoRun{
			{DaysAgo: 9, Total: 8, Correct: 5},
			{DaysAgo: 1, Total: 8, Correct: 7},
		},
	},
}
