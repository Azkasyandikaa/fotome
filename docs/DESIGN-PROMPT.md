# FOTOME — Design System: Comic-Candy-Aesthetic-Modern

> Dokumen tunggal untuk merawat UI Fotome: palet, tipografi, komponen, arah
> halaman-per-halaman, plus blok **PROMPT UTAMA** siap copy-paste ke AI/design
> tool. Versi v7 — menggabungkan tema *"foto-lab retro imut"* lama dengan
> spesifikasi **Comic-Candy-Aesthetic-Modern** yang kini sudah terpasang
> penuh di kode (`src/styles/tokens.css` + `src/styles/comic.css`).

**Vibe:** Pop-Art Playful × Pastel Dreamy × Glassmorphic Modern.
**Font:** Heavy Comic Display (Bangers) + Clean Geometric Sans (Plus Jakarta Sans).

---

## 1. Ringkasan Sistem (apa yang di-desain)

Fotome adalah **photobooth online yang jalan 100% di browser**. Tidak ada foto
yang diunggah — semua diproses lokal via Canvas API. Server hanya menyajikan
file statis dan manifest drop-in.

**Alur pengguna (hash-based SPA):**

```
HOME (#/)            → strip contoh + ajakan "MULAI FOTO"
  ↓
FRAMES (#/frames)    → cari / filter kategori & jumlah foto 1–5
  ↓
CAPTURE (#/capture)  → fase PICK (pilih frame) → fase LIVE (kamera, filter
  ↓                    live, timer, mirror) — 1 jepretan per slot (1–5)
EDIT (#/edit)        → atur foto per slot, stiker, emoji, pen, layer
  ↓
DOWNLOAD (#/download) → PNG/JPEG full-res + opsional galeri / WA admin
  ↓
GALLERY/CREDIT/GUIDE (#/gallery · #/credit · #/guide) — pelengkap
```

**Karakter interaksi yang wajib terasa:**

- Shutter = lingkaran besar ber-ring putus-putus; tekan → countdown 3-2-1 →
  flash → foto "jatuh" ke slot strip.
- Stiker di-grab langsung di kanvas: drag pindah, titik sudut resize,
  knob atas rotasi (mouse & sentuh).
- Filter kamera terlihat live di preview DAN di thumbnail chip.

---

## 2. 🌈 Color Palette (Palet Warna)

| Nama             | Kode      | Token CSS                    | Penggunaan Utama                          |
| ---------------- | --------- | ---------------------------- | ----------------------------------------- |
| Bubblegum Pop    | `#FF6B99` | `--color-primary`            | CTA utama, border aktif, tombol jepret    |
|  Lavender Dream   | `#A682FF` | `--color-accent`             | Aksen sekunder, badge, chip kategori      |
| Mint Fresh       | `#4ECCA3` | `--color-success`/`--color-mint` | Status sukses, tombol "Lanjut ✓"      |
| Sunshine Yellow  | `#FFD166` | `--color-lemon`/`--color-warning` | Peringatan, highlight bintang, hover  |
| Ink Black        | `#1A1A24` | `--color-ink`/`--color-text` | Garis outline komik (stroke), teks utama  |
| Sugar White      | `#FFF9FB` | `--color-bg`                 | Latar kartu / glass panel                 |
| Canvas Dark      | `#0F0E17` | `--color-canvas-dark`        | Latar full-viewport mode capture/edit     |

Aturan pakai:

- Satu aksen dominan per layar (Bubblegum); Lavender/Mint/Sunshine sebagai
  bumbu (badge, status, hover) — bukan ramai setara.
- Teks DI ATAS Bubblegum/Mint/Lavender selalu putih, bukan tinta.
- Bayangan komik **selalu Ink Black pekat**, tanpa blur: kartu
  `4px 4px 0` → hover `8px 8px 0` (token `--shadow-card*`).

---

## 3. ✍️ Typography (Tipografi)

| Peran                  | Token           | Stack (Google Fonts di `index.html`)            | Karakteristik                                        |
| ---------------------- | --------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Display / Heading      | `--font-display`| **Bangers** → Fredoka → system-ui               | Komik pop-art, tebal, uppercase, tracking 0.04em     |
| Aksen komik / stiker   | `--font-comic`  | Bangers → Luckiest Guy → Fredoka                | Kicker, judul kartu, logo & credit                   |
| Body / UI / Tombol     | `--font-ui`     | **Plus Jakarta Sans** → Nunito → system-ui      | Geometris, bersih, tetap terbaca di HP & desktop     |
| Caption teknis (mono)  | `--font-mono`   | JetBrains Mono                                  | Label strip "FOTOME · STRIP-01 · ✦", readout presisi |

Aturan pakai:

- Heading & judul komik diberi **stroke/bayangan tinta** ala pop-art
  (bukan glow). Jangan pakai Bangers untuk body text — ia hanya untuk
  dramatisasi, bukan keterbacaan.
- Tombol memakai font UI kapital dengan `letter-spacing` renggang
  (`--tracking-wide`), bukan Bangers.

---

## 4. 🧩 Desain Komponen (Glassmorphism + Comic Border)

### A. Kartu & Panel (Glass Comic Card)

- Latar **transparan lembut** (Sugar White 72% + `backdrop-filter: blur(14px)`,
  token `--glass`), dibingkai **garis tinta tebal 3px** (`--line-comic`).
- Drop shadow pekat 2D tanpa gradasi blur: `--shadow-comic = 4px 4px 0 #1A1A24`.
- Hover: kartu memantul naik `translateY(-4px)` dan bayangan membal jadi
  `--shadow-comic-lg = 8px 8px 0`.
- Panel capture/editor menambah aksen strip candy di tepi atas
  (`.panel-card::before`).

### B. Tombol

- **Tombol Jepret** (`#/capture`): lingkaran besar — ring Ink 2px, inti
  Bubblegum Pop radial, dikelilingi **garis putus-putus** ala cetakan komik
  lawas (`outline: dashed` bubblegum). Saat menembak: animasi `shutter-pulse`;
  flash + fotos masuk slot.
- **Tombol navigasi biasa**: pill `rounded-full`, pastel ceria, teks kapital
  tebal `letter-spacing` renggang, outline tinta + hard shadow; hover naik
  2px, tekan menempel turun.
- `LANJUT ✓`/sukses memakai **Mint Fresh**; peringatan memakai Sunshine.

### C. Chip & Badge

- Chip filter: pill "permen kenyal" — outline tinta 2.5px + hard shadow kecil.
- Aktif = **Bubblegum Pop** + teks putih tebal + micro-scale (1.04).
- Badge jumlah foto (kartu frame): bintang/permen di pojok kanan atas kartu.

### D. Aset Dekoratif Pendukung

- **Ikon:** garis tinta 2px, rounded, hand-drawn feel (SVG inline ala
  Lucide/Phosphor ber-outline 2px berwarna Ink Black) — bukan ikon korporat.
- **Stiker/badge candy:** bintang sparkle 4 sudut ✦ (`--deco-spark`),
  balon komik (speech bubble) untuk tooltip/panduan, washi tape miring.
- **Pola latar** (token siap pakai di `tokens.css`):
  - `--pattern-halftone` / `--pattern-halftone-pink` — titik halftone ala
    komik 90-an untuk hero & empty state.
  - `--pattern-wavy` — garis pastel bergelombang hero (pink/lavender/mint).
  - `--pattern-checker` — kotak-kotak catur halus untuk lubang frame transparan.

### E. Background utama

- **Halaman biasa:** Sugar White + halftone tinta tipis + sapuan candy
  pink/lavender dari pojok (lihat `body` di `comic.css`).
- **Mode Capture/Edit (full-viewport):** Canvas Dark `#0F0E17` — gradasi
  gelap minimalis dengan **partikel bintang kecil** putih/bubblegum/lavender/
  sunshine melayang (night sky candy). Kartu Sugar White menonjol di atasnya.
  Diimplementasi di `body.is-fullview` (`comic.css` §13).

---

## 5. 🚀 Panduan Eksekusi Halaman per Halaman

### 5.1 🏠 Beranda (`#/`)

- Hero: kicker mono "✦ photobooth online — gratis ✦", judul komik `fotome`
  (aksen bubblegum pada suku kata _to_) + tagline; figur maskot/strip contoh
  di sebelah kanan dengan tilt scrapbook mini.
- Galeri featured: kartu foto berbingkai miring acak (`rotate-1`/`-rotate-2`)
  kesan polaroid di dinding kamar estetik, glass card + comic border.
- CTA: `MULAI FOTO` (primary), `KREDIT` / `DONASI` (ghost).
- Bagian cara-pakai 4 langkah + catatan privasi "diproses di perangkatmu".

### 5.2 🖼 Pilih Frame (`#/frames`)

- Filter bar: chip kategori pill melayang; **aktif berubah Bubblegum Pop,
  teks putih tebal**, micro-bounce seperti permen kenyal.
- Frame card: pratinjau dengan lubang transparan berpola **checker catur
  abu-abu halus**; badge jumlah foto berbentuk bintang di pojok; selected =
  border bubblegum 3px + tilt + badge ✓.
- Ada pencarian realtime, filter jumlah foto 1–5, panel settingan frame.

### 5.3 📸 Ambil Foto (`#/capture`)

- Background halaman: **Canvas Dark night-sky candy** (bintang partikel).
- Panel sisi (strip/daftar) tetap Sugar White glass + comic border agar
  kontras aman di langit gelap.
- Dock filter: chip thumbnail LIVE asli (bukan kotak warna polos), aktif =
  ring bubblegum.
- Shutter besar mudah ditekan ibu jari: lingkaran + dashed ring bubblegum +
  pulse saat menembak.
- Per jepretan: countdown pop 3-2-1 → flash → foto jatuh ke slot → panel jeda
  `ULANGI FOTO` / `LANJUT →` (aria-live); setelah foto ke-3 → review
  `MULAI ULANG` / `LANJUT EDIT`.
- Kamera tak tersedia → panel status + tombol Coba lagi (jangan blank).

### 5.4 🎨 Editor (`#/edit`)

- Kanvas tengah bersih dengan border komik tipis; preview setengah resolusi
  (unduhan SELALU full-res).
- Panel alat kanan bertab rapi: **FOTO 1–n** (thumbnail asli; foto aktif
  dibingkai putus-putus), **STIKER** (grid per kategori + cari), **EMOJI**,
  **PEN** (6 swatch + ketebalan + penghapus).
- Stiker/teks punya **knob rotasi di atas** yang jelas + knob sudut resize;
  properti layer (naik/turun/di-belakang-frame, duplikat, hapus).
- Undo/redo semua aksi; `SELESAI / UNDUH` → DownloadModal.

### 5.5 ⬇ Unduh (`#/download`) & 🍬 Modal

- Perayaan: **konfeti candy** warna-warni meletup dari atas layar saat
  halaman terbuka; pratinjau hasil foto "terpajang" tengah dengan bayangan
  komik dalam.
- Pilih PNG (tanpa latar) / JPEG 92%, nama `fotostrip-YYYYMMDD-HHmmss`.
- DonationModal: QR + metode (GoPay/DANA/BCA) baris bisa dicopy + toast.
- Modal: glass card + comic border di atas backdrop gelap transparan.

### 5.6 🔮 Easter Eggs & Mode Spesial

- **Mode Pesta** (`f` ditekan 3×): layar dipenuhi partikel permen & bintang
  komik berhamburan.
- **Gerbang Developer** (ketuk logo "fotome." 7×): modal transparan bergaya
  terminal cyberpunk-pop dengan efek ketikan mesin tik retro (`#/devlogin`).

---

## 6. 🎯 PROMPT UTAMA (copy-paste)

```
Desain UI untuk "FOTOME" — photobooth web app (Home, Frames, Capture, Editor,
Download, Gallery, Credit), mobile-first tapi enak di desktop. Bahasa UI:
Indonesia santai, label aksi kapital ("MULAI FOTO", "LANJUT EDIT").

GAYA VISUAL — Comic-Candy-Aesthetic-Modern (pop-art playful × pastel dreamy ×
glassmorphism modern):
- Halaman biasa: Sugar White #FFF9FB + halftone tinta tipis + sapuan candy
  pastel (pink/lavender) dari pojok. Wajah komik: outline Ink Black #1A1A24.
- Mode capture/edit: Canvas Dark #0F0E17 dengan partikel bintang kecil
  melayang (night sky candy); kartu UI tetap Sugar White menonjol di atasnya.
- Palet: Bubblegum Pop #FF6B99 (CTA, border aktif), Lavender Dream #A682FF
  (badge/chip sekunder), Mint Fresh #4ECCA3 (sukses/lanjut ✓), Sunshine
  Yellow #FFD166 (highlight/hover).
- Kartu & panel: semi-transparan Sugar White + blur (glassmorphism) dibingkai
  garis tinta 3px khas komik; drop shadow 2D pekat TANPA blur -
  4px 4px 0 #1A1A24; hover memantul translateY(-4px), shadow 8px 8px 0.
- Tipografi: heading = Bangers (komik pop-art, uppercase, tracking tipis);
  body/UI/tombol = Plus Jakarta Sans geometris bersih; caption teknis =
  JetBrains Mono ("FOTOME · STRIP-01 · ✦").
- Aset: ikon outline 2px Ink (duotone/hand-drawn), bintang sparkle ✦ 4 sudut,
  speech bubble, washi tape, pola halftone & wavy pastel stripes.

KOMPONEN:
- Tombol: pill besar pastel + hard shadow tinta, teks kapital letter-spacing
  renggang; ghost = outline tinta. Tombol jepret: lingkaran raksasa Bubblegum
  Pop ber-ring putus-putus ala cetakan komik, animasi pulse saat menembak.
- Chip filter: pill permen kenyal, aktif berubah Bubblegum + teks putih tebal.
- Kartu frame: rasio 9:16 + checker catur halus pada lubang transparan +
  badge bintang jumlah foto; terpilih = border bubblegum 3px + tilt + ✓.
- Strip foto: kartu putih membulat ber-slot; slot kosong garis putus-putus
  pink; slot aktif frame putus-putus.
- Kamera: stage bezel tinta + dot progres + watermark "fotome ✦"; dock filter
  chip thumbnail LIVE.
- Editor: toolbar tab (FOTO/STIKER/EMOJI/PEN), knob rotasi jelas di atas
  stiker/teks, panel properti layer.
- Modal: glass card + comic border di atas backdrop gelap; toast pill imut.
- Unduh: konfeti candy meletup dari atas layar.

MIKRO-INTERAKSI:
- Countdown 3-2-1 pop-scale → flash putih 120ms → foto jatuh + settle ke slot.
- Semua hover: naik 2–4px + shadow membesar; transisi 150–200ms ease-out.
- Loader spinner kustom, bukan skeleton abu-abu generik.

EKSEKUSI HALAMAN:
- HOME: hero komik + featured gallery kartu miring scrapbook (rotate ±1–2°).
- FRAMES: chip filter permen aktif bubblegum; frame card checker + badge.
- CAPTURE: langit gelap night-sky, panel UI Sugar White menyala di atasnya,
  shutter raksasa dashed-ring mudah dijangkau ibu jari.
- EDITOR: kanvas bersih + tab alat + knob rotasi.
- DOWNLOAD: konfeti + pratinjau megah bayangan dalam.

JANGAN: dashboard SaaS abu-abu, gradien glossy, blur pada bayangan (hanya
untuk glass panel), ikon korporat, font Inter/Poppins, layout kaku; jangan
menyiratkan upload foto (semua diproses di perangkat).
```

---

## 7. Token Design System (sudah terpasang di `src/styles/tokens.css`)

| Token                       | Nilai                        | Pemakaian                          |
| --------------------------- | ---------------------------- | ---------------------------------- |
| `--color-bg`                | `#fff9fb` (Sugar White)      | latar halaman + halftone + wash    |
| `--color-canvas-dark`       | `#0F0E17`                    | latar full-viewport capture/edit   |
| `--color-surface`           | `#ffffff`                    | permukaan kartu                    |
| `--color-ink` / `--color-text` | `#1a1a24` (Ink Black)     | garis komik, teks utama            |
| `--color-primary`           | `#ff6b99` (Bubblegum Pop)    | CTA, fokus, seleksi, chip aktif    |
| `--color-accent`            | `#a682ff` (Lavender Dream)   | badge, aksen sekunder              |
| `--color-success`/`--color-mint` | `#4ecca3` (Mint Fresh)  | sukses, tombol lanjut ✓            |
| `--color-lemon`/`--color-warning`| `#ffd166` (Sunshine)    | highlight, hover, peringatan       |
| `--font-display` / `--font-comic` | Bangers (+fallback)    | heading komik, logo, kicker        |
| `--font-ui`                 | Plus Jakarta Sans            | body, UI, tombol                   |
| `--font-mono`               | JetBrains Mono               | caption strip, label teknis        |
| `--line-comic` / `--line-comic-thick` | `3px / 4px solid ink` | border kartu & panel komik       |
| `--shadow-card` / `--shadow-card-hover` | `4px 4px 0` / `8px 8px 0` ink | elevasi kartu (hard, tanpa blur) |
| `--glass` + `--backdrop-blur` | Sugar White 72% + blur14   | panel glassmorphic                 |
| `--pattern-halftone(-pink)` / `--pattern-wavy` / `--pattern-checker` | — | pola latar komik & catur |
| `--radius-lg` / `--radius-pill` | `18px / 999px`           | kartu / elemen pil                 |
| `--duration-*` + `--ease-out` | 160/260/420ms              | semua transisi ≤200ms pada hover   |

---

## 8. Aturan Aksesibilitas & Performa (non-negotiable)

- Kontras: tinta di atas Sugar White aman; teks di ATAS warna aksen (bubblegum/
  mint/lavender) WAJIB putih; teks langsung di Canvas Dark memakai candy light
  (`#f6f2ff`).
- Semua kontrol punya `aria-label` (shutter, mirror, switch, timer), status
  jepretan `aria-live`.
- `[hidden]` selalu menang atas display — state UI dirender JS, tak pernah
  "setengah disembunyikan".
- Focus ring 3px bubblegum, jangan pernah dihilangkan.
- Thumbnail `loading="lazy"`; animasi hover ≤200ms; tanpa animasi berat di
  mobile; hormati `prefers-reduced-motion` (sudah otomatis di tokens/comic).
- Foto tidak pernah menyentuh server — desain tidak boleh menyiratkan upload
  (progress bar upload = salah konsep).

---

## 9. Mood Board Verba (referensi cepat)

> Komik pop-art bertemu permen pastel: panel bergaris tinta hitam tebal dengan
> bayangan tercetak pekat (4px 4px 0), halftone titik-titik 90-an, bintang
> sparkle ✦ di pojok, balon bicara komik untuk panduan. Panel UI-nya seperti
> kaca permen translucent (glassmorphism) yang dibingkai stiker komik — imut
> karena bentuk, stroke, dan rasa; bukan karena tumpukan emoji. Di malam hari
> (capture/edit) semuanya lari ke langit gelap berbintang dan kartu candy
> berkilau di atasnya.
