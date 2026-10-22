# Fotome

Photobooth online yang ringan: pilih frame, ambil foto lewat kamera perangkat,
hias dengan stiker/emoji/coretan, lalu unduh sebagai satu gambar. **Semua
pemrosesan foto terjadi di browser** (Canvas API) — tidak ada foto yang dikirim
atau disimpan di server.

---

## Daftar isi

1. [Alur pengguna (end-to-end)](#1-alam-pengguna-end-to-end)
2. [Fitur lengkap](#2-fitur-lengkap)
3. [Menjalankan (development)](#3-menjalankan-development)
4. [Build & jalankan di server (STB)](#4-build--jalankan-di-server-stb)
5. [Studio frame admin (#/admin) — atur slot tanpa buka kode](#5-studio-frame-admin-admin--atur-slot-tanpa-buka-kode)
6. [Struktur folder template: per kategori & per slot](#6-struktur-folder-template-per-kategori--per-slot)
7. [Folder drop-in (frame, stiker, filter)](#7-folder-drop-in-frame-stiker-filter)
8. [Musik latar (drop-in)](#8-musik-latar-drop-in)
9. [Galeri publik & upload developer](#9-galeri-publik--upload-developer)
10. [Menambah template via JSON (alternatif developer)](#10-menambah-template-via-json-alternatif-developer)
11. [Konfigurasi situs (QR donasi, profil, admin WA)](#11-konfigurasi-situs)
12. [Struktur kode](#12-struktur-kode)
13. [Catatan performa & keamanan](#13-catatan-performa--keamanan)
14. [Deploy ke platform Node + volume persisten](#14-deploy-ke-platform-node--volume-persisten)

---

## 1. Alur pengguna (end-to-end)

Rute SPA pakai hash (`#/…`), jadi setiap halaman bisa dibuka langsung lewat URL.

```
#/            Beranda — kartu fitur, ajakan mulai
   │
   ▼ "Pilih frame"
#/frames      PILIH FRAME
   │           · cari frame (realtime)
   │           · filter KATEGORI (chip, gulir ← →)
   │           · filter JUMLAH FOTO 1–5 (chip, gulir ← →)
   │           · lihat settingan frame (jepretan, rotasi, ukuran, kanvas)
   ▼ "Lanjut ke jepretan"
#/capture     FASE 1 — PICK: daftar frame + preview besar
   │           (tombol Ganti Foto Demo untuk cek posisi tiap slot)
   ▼ "PILIH FRAME"
#/capture     FASE 2 — LIVE: strip hidup (kiri) + kamera (kanan)
   │           · filter warna live (chip dengan thumbnail real-time)
   │           · timer 3/5/10 detik atau tanpa timer
   │           · mode cermin (selfie)
   │           · tiap jepretan: jeda → ULANGI FOTO / LANJUT
   │           · jumlah jepretan = jumlah slot frame (1–5)
   ▼ "LANJUT EDIT"
#/edit        EDITOR — hias foto
   │           · tab Foto 1..n (thumbnail asli) — zoom/geser/putar foto
   │             di dalam lubang frame
   │           · stiker PNG + emoji — seret, resize, putar langsung di kanvas
   │           · alat gambar (pen) 6 warna + ketebalan, penghapus coretan
   │           · susunan layer: maju/mundur, di atas atau di belakang frame
   │           · undo/redo (Ctrl+Z / Ctrl+Shift+Z)
   ▼ "Lanjut ke Unduh"
#/download    UNDUH — pilih PNG/JPEG, lihat resolusi & ukuran estimasi,
              unduh. Opsional: kirim ke galeri / chat admin via WhatsApp.
#/gallery     Galeri publik (opsional, butuh server)
#/credit      Kredit developer (opsional)
#/guide       Tutorial langkah demi langkah
#/admin       Studio frame khusus ADMIN (lihat bagian 5)
```

**Privasi:** foto hanya hidup sebagai `ImageBitmap` di memori tab — hilang saat
tab ditutup. Tidak ada endpoint server yang menerima foto pengunjung.

---

## 2. Fitur lengkap

### Pemilihan frame (#/frames & picker kamera)

- **Kategori otomatis** — diambil dari nama folder / `template.json`, bukan
  hard-code. Kategori baru langsung muncul tanpa ubah kode.
- **Filter jumlah foto 1–5** — frame 1 slot = 1 jepretan, frame 5 slot = 5
  jepretan; jumlah jepretan otomatis mengikuti frame yang dipilih.
- **Gulir ← →** — baris kategori dan baris jumlah foto bisa digeser pakai
  mouse lewat tombol panah di tepi baris (muncul otomatis kalau barisnya
  masih ada sisa; hilang saat sudah mentok). Baris tidak pernah menumpuk ke
  bawah.
- **Pencarian realtime** — cocokkan nama, kategori, dan kata kunci.
- **Panel settingan frame** — jepretan, rotasi foto, ukuran foto, ukuran
  kanvas ditampilkan sebelum memakai frame.

### Kamera (halaman Ambil Foto)

- Preview live dengan **filter warna** — tiap chip filter menampilkan
  thumbnail hasil kamera sungguhan, jadi efeknya kelihatan sebelum jepret.
- Filter drop-in (overlay PNG + CSS tone) di-bake ke setiap foto saat jepret.
- **Timer** 3 / 5 / 10 detik atau tanpa timer.
- **Mode cermin** (selfie) — state diingat di localStorage.
- Alur per jepretan: hitung mundur → jepret → jeda (ULANGI FOTO / LANJUT) →
  ulangi; jepretan terakhir langsung membuka review akhir (MULAI ULANG /
  LANJUT EDIT).
- Strip di kiri terisi foto per foto — langsung terlihat masuk slotnya.

### Editor (halaman Edit)

- **Tab foto ber-thumbnail** — tiap foto tampil thumbnail aslinya; klik tab
  lalu atur **ukuran (zoom), putar, dan geser** foto di dalam lubang frame
  (slider + seret langsung di kanvas: sudut = zoom, knob atas = putar).
- **Stiker & emoji** — grab langsung di kanvas: seret untuk pindah, titik
  sudut untuk resize (lebar/tinggi independen), knob atas untuk rotasi —
  mouse maupun sentuh. Ada pencarian + kategori stiker.
- **Alat gambar (pen)** 6 warna + ketebalan; **penghapus coretan** berbentuk
  bulat dengan ukuran adjustable.
- **Susunan layer** — maju/mundur satu, ke depan/ke belakang, dan toggle
  *Di atas frame / Di belakang frame* (stiker bisa ditaruh di belakang bingkai).
- **Undo/redo** untuk semua aksi (termasuk goresan pen), plus tombol Reset.
- Panel pengaturan manual: lebar, tinggi, ukuran, rotasi (derajat) dengan
  angka persen — presisi tanpa harus jago menyeret.

### Hasil & berbagi (halaman Unduh)

- Ekspor **PNG** (tanpa latar) atau **JPEG** (kualitas 92%), nama file
  otomatis `fotostrip-YYYYMMDD-HHmmss`.
- Preview resolusi penuh + estimasi ukuran file.
- **"Edit Ulang"** kembali ke editor dengan semua stiker/coretan tersimpan
  (draft per sesi).
- Opsional upload ke **galeri publik** (khusus developer) dan ajakan
  **kirim ke admin via WhatsApp** (link diisi di `site.json`).

### Lainnya

- **Musik latar** drop-in dari `public/music/` + widget piringan hitam.
- **Onboarding** sekali per browser: pilih tampilan HP/Desktop.
- **Mode pesta** — tekan `f` tiga kali. 🎉
- Rapi dari 360px sampai desktop lebar.

---

## 3. Menjalankan (development)

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Untuk tes dari HP di jaringan yang sama, akses
`http://<ip-komputer>:5173` (kamera butuh HTTPS atau localhost — di LAN
gunakan Chrome flag `--unsafely-treat-insecure-origin-as-secure` atau tes lewat
localhost tunnel).

Fitur galeri & endpoint production (termasuk login admin studio frame) ada di
server Express terpisah:

```bash
GALLERY_ADMIN_PASSWORD=rahasia PORT=8787 npm run serve   # terminal 2
```

Lalu `npm run dev` (vite) meneruskan `/api/gallery` ke `:8787`. Di mode dev
murni (tanpa server), studio frame `#/admin` tetap terbuka tanpa login dan
perubahan langsung ditulis ke `public/booth/templates/<id>/template.json`.

Smoke test end-to-end via Chrome CDP (butuh `npm run dev` jalan dulu):

```bash
node scripts/e2e-smoke.mjs
```

---

## 4. Build & jalankan di server (STB)

```bash
npm run build      # typecheck + vite build ke folder dist/
npm run serve      # compile server + jalankan Express di port 3000 (ubah via PORT=xxxx)
```

Server mengirim file statis (HTML/CSS/JS, template, sticker) dengan gzip,
cache header, rate limit ringan, dan header keamanan. Tidak ada endpoint yang
menerima foto. Cleanup `/tmp/photobooth` tetap berjalan untuk jaga-jaga.

Endpoint server:

| Method | Path                              | Keterangan                              |
| ------ | --------------------------------- | --------------------------------------- |
| GET    | `/healthz`                        | health check                            |
| GET    | `/api/booth`                      | manifest drop-in (di-scan ulang tiap request) |
| GET    | `/api/booth/admin-status`         | status login admin studio frame         |
| PUT    | `/api/booth/templates/:id`        | simpan `template.json` frame (admin)    |
| POST   | `/api/booth/templates`            | upload frame baru (admin) — query `?name=&category=&slots=`, body = file gambar |
| GET    | `/api/music`                      | manifest musik drop-in                  |
| GET    | `/api/gallery/…`                  | galeri publik + login/upload developer  |

Variabel env server:

| Variabel                 | Fungsi                                                    |
| ------------------------ | --------------------------------------------------------- |
| `PORT`                   | port Express (default 3000)                               |
| `GALLERY_ADMIN_PASSWORD` | password admin (galeri + studio frame `#/admin`); default `Azkasyan77` bila kosong |
| `GALLERY_DEV_BYPASS`     | `1` = lewati login (hanya untuk tes lokal!)               |
| `GALLERY_DIR`            | folder cache galeri (default `/tmp/photobooth/gallery`)   |
| `GDRIVE_*`               | lihat `docs/GALLERY-GDRIVE.md`                            |

---

## 5. Studio frame admin (#/admin) — atur slot tanpa buka kode

> Tujuannya: admin tidak perlu buka kode 1-1 lagi. Semua pengaturan posisi
> hasil jepretan bisa diatur langsung di web, drag & resize seperti stiker,
> lalu disimpan — langsung aktif untuk semua pengunjung tanpa build ulang.Buka **`#/admin`** di browser (mis. `http://localhost:3000/#/admin`).

### Dashboard status

Halaman admin diawali kartu status singkat: server (aktif + uptime), jumlah
frame, stiker, filter, musik, dan foto galeri — buat cek perkembangan
semuanya dari satu tempat.

### Login

- **Tidak ada tombol login di galeri.** Halaman khusus developer (`#/admin`:
  dashboard + editor frame) dibuka lewat **gerbang tersembunyi: tekan logo
  "fotome." di header 7x berturut-turut** (dalam ~1.5 detik per tekanan) →
  **halaman password khusus `#/devlogin`** → masukkan password → baru
  dashboard `#/admin` terbuka.
- Pakai **password developer** (`GALLERY_ADMIN_PASSWORD`). Kalau env tidak
  disetel, password bawaan **`Azkasyan77`** dipakai.
- Di mode dev (vite tanpa server) halaman `#/devlogin` otomatis meneruskan
  ke `#/admin` tanpa password.
- Sesi login di `#/devlogin` juga yang mengaktifkan mode developer di galeri
  (tombol hapus foto) — tanpa tombol login terpisah di sana.

### Foto homepage (⭐ Foto homepage)

- Panel baru di dashboard: **ceklis foto galeri** yang mau ditampilkan di
  beranda (menggantikan strip contoh lama), atau **upload foto baru**
  langsung dari situ — foto langsung tampil di homepage tanpa build ulang.
- Endpoint: `GET /api/gallery/featured` (publik, maksimal 12 foto) dan
  `PUT /api/gallery/featured` (admin, body `{ "ids": [...] }`).
- Kalau belum ada foto yang dicentang, beranda menampilkan kartu frame
  unggulan sebagai fallback.

### Editor

1. Daftar frame drop-in (dari `public/booth/templates/`) tampil di kiri —
   lengkap dengan thumbnail, kategori, dan jumlah slot.
2. Klik satu frame → muncul **preview frame besar** dengan lubang foto
   (slot) bergaris putus-putus pink di atasnya.
3. Atur lubang foto:
   - **seret badan lubang** = pindah posisi,
   - **seret titik sudut** = ubah ukuran (4 sudut, bebas lebar/tinggi),
   - **seret knob ⌃ di atas lubang** = putar lubang foto (Shift = snap 15°),
   - angka di pojok = urutan jepretan (Foto 1, Foto 2, …),
   - atau ketik angka presisi (X, Y, Lebar, Tinggi, **Rotasi °**, **Zoom**)
     di panel kanan — rotasi & zoom mengatur isi foto di dalam lubang,
     persis seperti pengaturan stiker.
4. **＋ Tambah slot** (maksimal 5) / **🗑 Hapus slot** — jumlah jepretan
   kamera otomatis mengikuti jumlah slot.
5. Pilih perilaku isi per slot: **Crop penuh (cover)** atau
   **Muat seluruh foto (contain)**.
6. Atur **identitas frame**: nama (ganti nama frame kapan saja), **kategori**
   (select dari daftar **Kelola kategori** — input bebas diganti supaya upload/
   edit tidak bisa membuat kategori baru), deskripsi, ukuran kanvas,
   warna latar.
7. **＋ Frame baru** (tombol di header) = **upload frame baru** langsung dari
   browser: pilih gambar (PNG transparan disarankan), isi nama, pilih kategori
   dari daftar resmi, dan jumlah foto (1–5) → frame langsung muncul di daftar dan aktif untuk
   semua pengunjung tanpa build ulang.
8. Tekan **💾 Simpan ke server** → ditulis ke
   `public/booth/templates/<id>/template.json` → selesai. Pengunjung
   mendapatkan settingan baru begitu halaman dimuat ulang (tanpa build).

Tombol **Kembalikan seperti tersimpan** membatalkan edit yang belum disimpan;
**Muat ulang daftar** menyegarkan daftar frame dari disk.

> Catatan: frame bawaan developer di `src/data/templates.json` tidak bisa
> diedit dari studio (file-nya bagian dari kode) — hanya frame drop-in dari
> folder `public/booth/templates/`.

---

## 6. Struktur folder template: per kategori & per slot

Supaya tidak pusing kalau frame makin banyak, folder template bisa disusun
berlapis — nama folder menentukan kategori dan jumlah slot otomatis:

```
public/booth/templates/
├── <nama-frame>/                     # polos (kategori dari template.json / "drop-in")
│   └── frame.png
├── <kategori>/                       # kategori = nama folder
│   ├── <nama-frame>/
│   │   ├── frame.png
│   │   └── thumb.png
│   └── <slot>/                       # slot = "1".."5" = jumlah foto
│       └── <nama-frame>/
│           ├── frame.png
│           └── template.json         # opsional, menimpa semua default
└── <slot>/                           # tanpa kategori, langsung jumlah slot
    └── <nama-frame>/frame.png
```

Contoh nyata:

```
templates/cute/3/strip-pink/frame.png     → kategori "cute", 3 jepretan
templates/party/5/grid-party/frame.png    → kategori "party", 5 jepretan
templates/lebaran/frame.png               → kategori dari template.json
```

Aturan:

- **Kategori** = nama folder pertama yang bukan angka (untuk frame nested
  level ≥ 2). Folder datar `templates/<nama>/frame.png` (termasuk hasil
  upload) **tidak** membuat kategori — kategorinya diambil dari
  `template.json` / studio `#/admin`.
- **Kategori baru hanya lewat fitur Kelola kategori** di `#/admin`
  (`public/booth/categories.json`). Chip kategori di `#/frames` hanya menampilkan
  daftar itu; frame tanpa kategori resmi masuk chip **Lainnya**.
- **Jumlah slot** = nama folder `1`..`5`. Tanpa folder slot → default 3 foto.
  `template.json` dengan `photoSlots` selalu menang atas default.
- Default slot tanpa `template.json`: N foto bertumpuk vertikal (margin
  kiri-kanan ~8% lebar kanvas).
- Refresh browser setelah menaruh file — folder di-scan ulang setiap halaman
  capture/editor/studio dibuka. Tidak perlu build ulang.

---

## 7. Folder drop-in (frame, stiker, filter)

Tinggal masukkan file, **tanpa ubah kode, tanpa build ulang** — refresh browser:

```
public/booth/
├── templates/<kategori>/<slot>/<nama>/
│   ├── frame.png        WAJIB — overlay bingkai (area foto transparan)
│   ├── thumb.png        opsional — preview picker
│   └── template.json    opsional — posisi slot custom (lihat booth/README.txt)
├── stickers/<Kategori>/<file>.png
│                         nama folder = kategori, otomatis muncul di UI
└── filters/<nama>/
    ├── overlay.png      WAJIB — overlay full-canvas
    ├── thumb.png        opsional
    └── filter.json      opsional — name, css, fit
```

**Biar hasil kamera pas di lubang frame:** paling mudah lewat studio `#/admin`
(geser-Resize seperti stiker, lihat bagian 5). Cara manual: tulis
`template.json` dengan `photoSlots` — di preview frame halaman Ambil Foto,
tekan **Ganti Foto Demo** untuk menggeser urutan foto demo ke tiap slot supaya
posisi lubang terlihat jelas. Panduan lengkap + contoh JSON ada di
`public/booth/README.txt`.

---

## 8. Musik latar (drop-in)

Taruh file lagu di `public/music/` — tanpa ubah kode, refresh browser:

```
public/music/
├── <nama-lagu>.mp3   mp3, m4a, ogg, opus, wav, flac, dll.
└── playlist.json     opsional — urutan, judul tampilan, on/off autoplay
```

Musik menyala otomatis (`autoplay: true`); kalau browser menahan autoplay, lagu
mulai pada interaksi pertama pengunjung. Widget piringan hitam di pojok kanan
bawah untuk pause/skip; pilihan diingat di localStorage. Panduan lengkap di
`public/music/README.txt`.

---

## 9. Galeri publik & upload developer

- `#/gallery` menampilkan foto yang **disetujui developer** (bukan semua foto).
- Upload hanya untuk developer: login password (`GALLERY_ADMIN_PASSWORD`,
  default `Azkasyan77`) lewat halaman tersembunyi `#/admin`, upload diproses
  di server, opsional diteruskan ke **Google Drive**
  (lihat `docs/GALLERY-GDRIVE.md`).
- **Tidak ada tombol login di halaman galeri sama sekali.** Kalau sesi
  developer aktif (login di `#/devlogin` via gerbang: tekan logo "fotome."
  di header 7x), galeri otomatis menampilkan mode developer (tombol hapus
  foto + logout). Kalau tidak, galeri tetap mode publik murni.
- Tanpa konfigurasi galeri, halaman tampil dengan keadaan kosong dan tombol
  upload disembunyikan — tidak mengganggu alur utama.

---

## 10. Menambah template via JSON (alternatif developer)

1. Buat overlay frame di `public/assets/templates/` (PNG/SVG).
2. (Opsional) Buat thumbnail kecil di `public/assets/templates/thumbs/`.
3. Tambahkan entri di `src/data/templates.json`:

```json
{
  "id": "wedding-01",
  "name": "Wedding White",
  "category": "wedding",
  "thumb": "/assets/templates/thumbs/wedding-01.svg",
  "keywords": ["wedding", "white", "elegant"],
  "description": "Clean white frame for the big day.",
  "enabled": true,
  "engine": {
    "canvas": { "width": 1080, "height": 1920 },
    "background": "#ffffff",
    "photoSlots": [
      { "photoIndex": 0, "x": 100, "y": 100, "width": 880, "height": 500 },
      { "photoIndex": 1, "x": 100, "y": 640, "width": 880, "height": 500 },
      { "photoIndex": 2, "x": 100, "y": 1180, "width": 880, "height": 500 }
    ],
    "overlay": "/assets/templates/wedding-01-overlay.png"
  }
}
```

`photoSlots` mendukung `fit: "cover"` (default, crop) atau `"contain"`, serta
`rotation` (derajat) dan `scale` (zoom) per slot.

Stiker via JSON: tambahkan baris di `src/data/stickers.json`:

```json
{ "id": "sunglasses", "name": "Sunglasses", "image": "/assets/stickers/sunglasses.png", "category": "party", "enabled": true }
```

---

## 11. Konfigurasi situs

- **QR donasi** — taruh `public/qr.png` (persegi, mis. 500×500). Tanpa file,
  fallback ke `public/assets/images/donation-qr.svg`. Metode bayar di
  `src/data/site.json` → `donation.methods`.
- **Profil developer** — `src/data/site.json` → `developer` (nama, bio,
  avatar, tech, links), plus `title`, `tagline`, `description`.
  Foto profil: timpa `public/assets/images/azka.png` (persegi ~256×256).
- **Chat admin WA** — `src/data/site.json` → `admin.chatUrl` (link wa.me).
  Kosong = tombol "Ya, kirim ke admin" tampil tapi nonaktif.
- **Tema** — warna, tipografi, spacing, radius, motion di
  `src/styles/tokens.css`.

---

## 12. Struktur kode

```
src/
├── main.ts              entry: shell (logo · menu · bantuan/musik) + route
├── app/                 router (hash-based SPA) + state (session, prefs)
├── pages/               home, frames, capture, editor, download, credit,
│                        guide, admin (studio frame)
├── components/          Camera, Countdown, TemplatePicker, StickerPicker,
│                        PhotoEditor, ScrollArrows, GalleryUpload, modals,
│                        toast
├── services/            camera, canvas (template engine), template, booth
│                        (manifest + simpan template), session, download,
│                        music, cloudGallery
├── data/                templates.json, stickers.json, filters.json, site.json
├── styles/              tokens, global, capture, editor, admin
└── types/               semua interface TypeScript

public/booth/            drop-in frame/stiker/filter (+ README.txt)
public/music/            drop-in musik (+ README.txt)
server/                  Express: static, booth-scan, music-scan, gallery,
                         auth, gdrive, cleanup
booth-plugin.js          middleware dev (manifest booth + simpan template)
scripts/e2e-smoke.mjs    smoke test end-to-end via Chrome CDP
docs/                    DESAIN & GALLERY-GDRIVE
```

---

## 13. Catatan performa & keamanan

- Render editor memakai resolusi setengah untuk preview; hasil download selalu
  full-resolution.
- Thumbnail template di-load `loading="lazy"`.
- Filter kamera di-bake sekali saat capture (Canvas `ctx.filter`) — preview
  live juga memakai filter yang sama.
- Rate limit ringan per IP di server; header keamanan dasar (nosniff, frame
  deny, referrer no-referrer, permissions-policy kamera self).
- Endpoint simpan frame (`PUT /api/booth/templates/:id`) hanya untuk admin
  login; id divalidasi ketat (hanya `\w` dan `-`) — tidak bisa tulis file
  sembarang.
- Studio frame menulis ke folder `public/` DAN `dist/` (production) supaya
  hasil edit tidak hilang saat build ulang.

---

## 14. Deploy ke platform Node + volume persisten

> **PENTING:** jangan deploy situs ini sebagai *static site murni* (misal
> Vercel/Netlify static). Fitur frame upload/edit, showcase homepage,
> leaderboard, dan galeri foto semuanya berjalan via server Express dan
> menyimpan file ke disk — di static hosting semua `/api/*` akan 404 dan
> dashboard admin mati.

### Konsep

- Container menjalankan **frontend build + server Express** (satu process).
  Sudah disiapkan `Dockerfile` yang bisa dipakai di Fly.io, Zeabur, Render,
  Koyeb, VPS (docker compose), dll.
- Semua **state mutable** (frame hasil upload, kategori, leaderboard,
  showcase, cache galeri) disimpan di folder `DATA_DIR`. Saat deploy, mount
  **persistent volume** di folder itu supaya data tidak hilang saat redeploy.
- Boot pertama: isi bawaan `public/booth/` otomatis di-copy (seed) ke
  `DATA_DIR/booth`, lalu semua perubahan admin ditulis ke sana saja.

### Variabel env

| Variabel                 | Fungsi                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `PORT`                   | port Express (default 3000; platform biasanya menyuntik sendiri)       |
| `DATA_DIR`               | folder state persisten (set `DATA_DIR=/app/data` + volume di situ)     |
| `GALLERY_ADMIN_PASSWORD` | WAJIB diganti di production — default bawaan ada di source code, bukan rahasia |
| `GALLERY_DIR`            | folder cache galeri (default `DATA_DIR/gallery` bila DATA_DIR diset)   |
| `GDRIVE_*`               | opsional Google Drive — lihat `docs/GALLERY-GDRIVE.md`                 |
| `GALLERY_DEV_BYPASS`     | `1` = lewati login — **jangan pernah** diset di production             |

### Deploy ke Fly.io (pakai volume)

```bash
# 1. Install CLI (sekali saja) — pilih sesuai OS: brew/shell script/powershell
fly version || fly version 2>/dev/null || curl -L https://fly.io/install.sh | sh

# 2. Buat app + volume di region terdekat
fly launch --no-deploy --region singapore   # kalau ada prompt, jangan pilih database tambahan
fly volumes create fotome-data --region singapore --size 3
fly deploy

# 3. Password admin (WAJIB sebelum dipakai publik)
fly secrets set GALLERY_ADMIN_PASSWORD="password-baru-yang-kuat"
```
`Dockerfile` sudah set `DATA_DIR=/app/data`; volume di-mounted ke `/app/data`
(mis. `fly volumes list` untuk cek attach). Health check: `/healthz`.

### Deploy ke Zeabur

1. Push repo ke GitHub → **Zeabur → New Service → Git** → pilih repo
   (Zeabur otomatis memakai Dockerfile).
2. Add **Volume**: mount ke `/app/data`.
3. Variables: `GALLERY_ADMIN_PASSWORD=<password-kuat>`, `DATA_DIR=/app/data`
   (sudah di-set Dockerfile, tapi boleh diulang).
4. Network → tambah custom domain atau pakai subdomain Zeabur.

### Cek pasca-deploy

1. Buka `https://<domain>/healthz` → harus `{"ok":true,...}`.
2. Beranda tampil, `#/frames` menampilkan semua frame drop-in, frame bisa
   dipakai sampai halaman unduh.
3. Login admin (gerbang `#/admin`) → gladiskan upload frame baru →
   redeploy app → **frame tidak boleh hilang** (bukti volume bekerja).
4. `#/api/gallery/status` → `authConfigured:true`.

