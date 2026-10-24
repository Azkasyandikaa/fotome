🎨 Stitch AI Prompts — Fotome (Photobooth Online)

> Cara pakai: salin **satu prompt per satu screen** ke Stitch AI, berurutan.
> Tempel blok "DESIGN SYSTEM" sebagai prompt pertama (atau gabung ke setiap prompt).
> Semua teks UI pakai bahasa Indonesia (sesuai aplikasi aslinya).

---

## 0. DESIGN SYSTEM (tempel ini dulu / gabungkan di tiap prompt)

```
Desain UI web untuk "Fotome." — photobooth online gratis yang imut, ramah, dan playful.

GAYA VISUAL:
- Estetika "cute/kawaii pastel": latar krem/putih hangat, aksen pink lembut,
  lavender, mint. Sudut membulat besar (radius 16–24px), bayangan lembut.
- Tipografi bulat dan ramah (rounded sans seperti Quicksand/Baloo 2).
- Dekorasi kecil: bintang ✦, sparkles, garis dashed pink, stiker/emoji.
- Aksen pink (#ff5fa2 / rose) sebagai warna utama, tombol dengan hover naik.
- Header atas: logo "fotome." (kata "fotome" tebal, titik pink) + menu kanan
  (Galeri, Kredit, Donasi, GitHub) + 2 ikon bulat kecil (buku tutorial, musik).
- Footer: marquee/ticker berjalan "jepret ✦ hias ✦ unduh ✦ repeat ✦" + kolom
  link (Pilih frame, Cara pakai, Galeri, Kredit, GitHub, Donasi) + tagline
  "Photobooth online imut: pilih frame, jepret, hias stiker, unduh. Beres
  dalam semenit." + catatan "Foto diproses secara lokal di perangkatmu."
- Responsive 360px (mobile) sampai desktop lebar. Semua tombol besar, ramah sentuh.
```

---

## 1. SCREEN — Beranda (`#/`)

```
Halaman BERANDA aplikasi web "Fotome." (photobooth online imut).

Isi:
- Hero: judul besar playful (mis. "Jepret, hias, unduh — beres semenit!"),
  subteks singkat "Photobooth online gratis, semua diproses di perangkatmu.",
  CTA tombol pink besar "Pilih frame →" yang menuju pemilihan frame.
- Baris strip foto polaroid miring-rapi (foto dari galeri) sebagai dekorasi hero.
- Bagian "Foto dari pengunjung" — grid 3–4 foto galeri featured (fallback:
  kartu frame unggulan dengan thumbnail frame photobooth).
- 3–4 kartu fitur ber-icon: "Pilih frame" (bingkai warna-warni), "Jepret
  pakai kamera" (kamera + timer), "Hias stiker & coretan" (stiker/emoji),
  "Unduh & bagikan" (unduh PNG/JPEG).
- Kartu donasi kecil "Dukung fotome." dengan gambar QR code.

Header + footer sesuai design system.
```

---

## 2. SCREEN — Pilih Frame (`#/frames`)

```
Halaman PILIH FRAME (katalog) untuk "Fotome.".

Isi dari atas ke bawah:
- Judul "Pilih frame" + subteks.
- Kolom pencarian besar dengan ikon kaca pembesar, placeholder
  "Cari frame… (nama, kategori, kata kunci)" — pencarian realtime.
- Baris chip KATEGORI yang bisa digulir horizontal (panah ◀ ▶ di tepi baris,
  muncul hanya saat masih ada sisa): All, Cute, Party, Wedding, Lebaran,
  Merdeka, Mother's Day, Lainnya. Chip aktif = pink terisi.
- Baris chip JUMLAH FOTO yang bisa digulir horizontal: "Semua", "1 foto",
  "2 foto", "3 foto", "4 foto", "5 foto".
- Grid kartu frame (3–4 kolom desktop, 2 kolom HP): tiap kartu = thumbnail
  frame photobooth (bingkai PNG dengan lubang foto transparan), nama frame,
  badge kategori kecil, badge jumlah slot (mis. "3 foto"). Hover naik.
  Beberapa kartu punya latar berbeda agar terlihat variasi.
- Panel/kartu "Setelan frame" (muncul saat frame dipilih / di detail):
  menampilkan jumlah jepretan, rotasi foto default, ukuran foto, ukuran
  kanvas (mis. 1080×1920) — dengan ikon kecil per baris.
- CTA sticky di bawah: tombol pink besar "Lanjut ke jepretan →".

Header + footer sesuai design system.
```

---

## 3. SCREEN — Ambil Foto / Fase Pick (`#/capture` — fase 1)

```
Halaman AMBIL FOTO — FASE PICK (pemilihan ulang frame sebelum jepret).

Layout:
- Judul kecil "Siap jepret?" + langkah 1 dari 3 ("Pick → Jepret → Edit").
- Preview frame BESAR di tengah (bingkai photobooth vertikal dengan lubang
  foto bergaris putus-putus pink; tiap lubang berisi foto demo berbeda dan
  angka urutan "1 2 3" di pojoknya).
- Panel kiri/bawah: daftar frame kecil (thumbnail + nama) untuk ganti frame.
- Tombol sekunder "Ganti Foto Demo ⟳" (menggeser foto demo antar slot agar
  posisi lubang terlihat).
- Info jumlah jepretan: "Frame ini butuh 3 foto".
- CTA pink besar "PILIH FRAME →" masuk ke mode kamera.

Halaman ini full-viewport (tanpa scroll body). Header minimal.
```

---

## 4. SCREEN — Ambil Foto / Fase Live Kamera (`#/capture` — fase 2)

```
Halaman AMBIL FOTO — FASE LIVE (kamera aktif). Full-viewport, dua panel.

KIRI — Strip foto hidup:
- Strip vertikal frame photobooth, lubang-lubangnya terisi foto satu per
  satu sesuai progress; slot belum terisi tampil placeholder dashed pink
  dengan angka urutan.

KANAN — Panel kamera:
- Preview kamera besar bulat-tumpul dengan filter warna aktif.
- Di atas preview: baris chip FILTER dengan thumbnail mini hasil kamera
  sungguhan per filter (None, Vintage, B&W, Cool, Warm, Pink…), bisa
  digulir horizontal.
- Baris chip TIMER: "3 dtk", "5 dtk", "10 dtk", "Tanpa timer" (chip aktif pink).
- Toggle "Mode cermin (selfie)" dengan ikon.
- Countdown besar di tengah preview (angka 3-2-1 atau lingkaran progress).
- Tombol jepret bulat BESAR pink di bawah tengah dengan cincin putih.
- Setelah jepret: kartu review mini dengan dua tombol "ULANGI FOTO" dan
  "LANJUT ✓"; pada jepretan terakhir jadi "MULAI ULANG" / "LANJUT EDIT →".
- Indikator progress kecil: "Foto 2 dari 3".

Header minimal, tanpa footer.
```

---

## 5. SCREEN — Editor (`#/edit`)

```
Halaman EDITOR hias foto. Full-viewport, dua kolom.

KIRI — Kanvas besar:
- Hasil strip photobooth (frame + foto) sebagai kanvas utama.
- Stiker terpilih punya bounding box: 4 titik sudut (resize), knob atas ⌃
  (rotasi), garis dashed pink. Contoh: stiker bintang & hati ditempel di frame.
- Contoh goresan pen pink di kanvas.

KANAN — Toolbar (tab-tab):
- Baris TAB FOTO ber-thumbnail di atas toolbar: "Foto 1" "Foto 2" "Foto 3"
  (tiap tab menampilkan thumbnail asli jepretan). Tab aktif pink.
- Panel per-foto: slider ZOOM, slider ROTASI (derajat), dan drag di kanvas
  (sudut = zoom, knob atas = putar); tombol reset per foto.
- Tab STIKER: pencarian + chip kategori, grid stiker/emoji PNG.
- Tab PEN (gambar): 6 bulatan warna + slider ketebalan, ikon penghapus
  coretan bulat dengan slider ukuran.
- Tab LAYER: tombol ▲ Maju, ▼ Mundur, ⏫ Ke depan, ⏬ Ke belakang, dan toggle
  "Di atas frame / Di belakang frame".
- Baris aksi atas/bawah: ↶ Undo, ↷ Redo, Reset, dan CTA pink besar
  "Lanjut ke Unduh →".

Header minimal, tanpa footer.
```

---

## 6. SCREEN — Unduh (`#/download`)

```
Halaman UNDUH hasil foto.

Isi:
- Judul "Hasil kamu siap! 🎉" + confetti dekoratif.
- Kiri: preview hasil resolusi penuh (strip photobooth utuh) dengan bayangan.
- Kanan panel aksi:
  - Pilihan format: dua kartu radio "PNG (tanpa latar)" dan "JPEG (92%)".
  - Info: resolusi penuh (mis. 1080×1920) + estimasi ukuran file (mis. ~840 KB).
  - Tombol pink besar "⬇ Unduh foto" (nama file otomatis fotostrip-YYYYMMDD-HHmmss).
  - Tombol sekunder "✎ Edit ulang" (kembali ke editor, draft tersimpan).
  - Bagian "Bagikan": tombol "Kirim ke galeri publik" (khusus developer,
    tampil subtle) dan tombol WhatsApp hijau "Ya, kirim ke admin" dengan
    ikon WhatsApp.
- CTA kecil "Jepret lagi" kembali ke pemilihan frame.

Header + footer sesuai design system.
```

---

## 7. SCREEN — Galeri Publik (`#/gallery`)

```
Halaman GALERI publik.

Isi:
- Judul "Galeri fotome." + subteks "Hasil jepretan yang sudah disetujui —
  mungkin foto kamu ada di sini ✦".
- Grid masonry/foto polaroid 3–4 kolom dengan rotasi kecil acak (−2°..2°),
  tiap kartu polaroid punya caption tanggal. Hover sedikit membesar.
- Filter chip kategori opsional di atas grid.
- KEADAAN KOSONG: ilustrasi kamera imut + "Belum ada foto. Jadilah yang
  pertama!" + CTA "Pilih frame".
- TANPA tombol login sama sekali di halaman ini.
- (Varian developer: pojok kanan atas muncul bar kecil admin — tombol hapus
  di tiap foto + tombol logout — hanya bila mode developer aktif.)

Header + footer sesuai design system.
```

---

## 8. SCREEN — Cara Pakai / Guide (`#/guide`)

```
Halaman TUTORIAL langkah demi langkah.

Isi:
- Judul "Cara pakai fotome." + subteks "Empat langkah, semenit beres ✦".
- Timeline vertikal / kartu langkah bernomor besar (1–4), tiap langkah =
  ilustrasi kecil + judul + 2–3 poin:
  1. Pilih frame — kategori, jumlah foto 1–5, lihat setelan frame.
  2. Jepret — timer 3/5/10 detik, filter warna live, mode cermin selfie,
     bisa ulangi foto mana pun.
  3. Hias — zoom/geser/putar foto, stiker & emoji, pen 6 warna, susunan
     layer, undo/redo.
  4. Unduh — PNG/JPEG, estimasi ukuran, kirim ke galeri atau chat admin WA.
- Kotak tips "Tahukah kamu?" (mis. easter egg mode pesta: tekan f 3x 🎉).
- CTA di akhir "Mulai sekarang →" ke pemilihan frame.

Header + footer sesuai design system.
```

---

## 9. SCREEN — Kredit (`#/credit`)

```
Halaman KREDIT developer.

Isi:
- Judul "Dibuat dengan ♥".
- Kartu profil developer besar di tengah: foto profil bulat, nama, bio,
  daftar chip teknologi (TypeScript, Vite, Canvas API, Express…), dan baris
  ikon link sosial (GitHub, dll).
- Kartu kecil "Dukung pengembangan" → tombol Donasi (QR).
- Teks ucapan terima kasih singkat + badge "fotome. — photobooth imut gratis ✦".

Header + footer sesuai design system.
```

---

## 10. SCREEN — Gerbang Developer (`#/devlogin`)

```
Halaman LOGIN developer (tersembunyi, minimalis).

Isi:
- Kartu kecil di tengah dengan ikon gembok/kunci, judul "Gerbang developer",
  subteks "Masukkan password untuk membuka studio frame & galeri dev."
- Input password dengan ikon mata (show/hide).
- Tombol pink "Masuk →" + link kecil "Kembali ke beranda".
- Catatan kecil di bawah: gerbang dibuka dengan menekan logo "fotome." 7x
  berturut-turut di header.

Latar halaman polos, tanpa footer.
```

---

## 11. SCREEN — Studio Frame Admin (`#/admin`)

```
Halaman STUDIO FRAME (dashboard admin). Dua bagian.

ATAS — Dashboard status: baris 5–6 kartu statistik kecil ber-icon:
Server (aktif + uptime), Frame (jumlah), Stiker, Filter, Musik, Foto galeri.

BAWAH — Editor frame, layout 3 kolom:
- KOLOM KIRI: daftar frame drop-in (thumbnail, nama, badge kategori, badge
  jumlah slot) + tombol "＋ Frame baru" (upload gambar: pilih PNG, nama,
  kategori, jumlah foto 1–5) dan "Muat ulang daftar".
- KOLOM TENGAH: preview frame BESAR dengan lubang foto slot bergaris
  putus-putus PINK di atasnya; tiap slot bisa diseret (badan = pindah,
  titik sudut = resize 4 sudut, knob ⌃ atas = rotasi, Shift = snap 15°),
  angka urutan di pojok tiap slot ("Foto 1", "Foto 2"...). Slot aktif lebih
  tebal garisnya.
- KOLOM KANAN: panel properti slot terpilih — input angka X, Y, Lebar,
  Tinggi, Rotasi °, Zoom; pilihan fit "Crop penuh (cover) / Muat seluruh
  foto (contain)"; tombol "＋ Tambah slot" (maks 5) & "🗑 Hapus slot".
  Di bawahnya panel identitas frame: nama, kategori (select + tombol
  "Kelola kategori"), deskripsi, ukuran kanvas, warna latar (color picker).
- Panel "⭐ Foto homepage": daftar ceklis foto galeri (maks 12) yang mau
  tampil di beranda + tombol upload foto baru.
- Bar aksi bawah sticky: "💾 Simpan ke server" (pink besar), "Kembalikan
  seperti tersimpan", "Muat ulang daftar".

Header + footer sesuai design system.
```

---

## 12. SCREEN GLOBAL — Komponen overlay (opsional, tempel terpisah)

```
Komponen overlay global "Fotome.":
1. MODAL DONASI: kartu tengah dengan QR code besar, daftar metode bayar
   (chip: QRIS, GoPay, DANA…), tombol salin nomor, tombol tutup ✕.
2. ONBOARDING (sekali per browser): overlay kartu tengah "Mau tampilan
   yang mana?" — dua kartu pilihan 📱 HP / 🖥 Desktop, lalu layar lanjutan
   "Baca tutorial dulu?" dengan tombol "Ya, buka tutorial" / "Lewati".
3. WIDGET MUSIK mengambang pojok kanan bawah: piringan hitam/vinyl bulat
   berputar dengan not, klik = play/pause, tombol skip ⏭ di sampingnya.
4. TOAST: kapsul kecil di bawah tengah (varian success pink & info).
5. MODAL BANTUAN/TUTORIAL dari ikon buku: ringkasan langkah 1–4 singkat.
6. MODE PESTA: layar dengan konfeti warna-warni berjatuhan 🎉.
```

---

## ✅ Checklist selesai mendesain (10 screen)

| #   | Screen                   | Route        |
| --- | ------------------------ | ------------ |
| 1   | Beranda                  | `#/`         |
| 2   | Pilih Frame              | `#/frames`   |
| 3   | Ambil Foto — Pick        | `#/capture`  |
| 4   | Ambil Foto — Kamera Live | `#/capture`  |
| 5   | Editor                   | `#/edit`     |
| 6   | Unduh                    | `#/download` |
| 7   | Galeri                   | `#/gallery`  |
| 8   | Guide                    | `#/guide`    |
| 9   | Kredit                   | `#/credit`   |
| 10  | Devlogin                 | `#/devlogin` |
| 11  | Studio Admin             | `#/admin`    |
| 12  | Overlay components       | global       |
