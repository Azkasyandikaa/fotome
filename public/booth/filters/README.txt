FOLDER FILTER DROP-IN — taruh overlay di sini tanpa ubah kode
==============================================================

Setiap SUBFOLDER = satu filter kamera. Isi folder:

  public/booth/filters/<nama-folder>/
    overlay.png     (WAJIB — overlay filter, transparan di bagian yang
                     tidak menutupi wajah. Ukuran bebas; idealnya 900x600
                     atau mengikuti rasio kamera 16:10, contoh 1200x750)
    filter.json     (opsional — atur nama + tone warna, lihat bawah)
    thumb.png       (opsional — gambar kecil untuk chip filter; kalau tidak
                     ada, dipakai overlay.png sendiri)

filter.json (opsional)
----------------------
  {
    "name": "Cinta Pink",
    "css": "brightness(1.06) saturate(1.15) hue-rotate(-6deg)",
    "fit": "cover"
  }

Field:
  name   nama yang tampil di chip filter (default: nama folder).
  css    tone warna dasar, format CSS filter, dipakai sebelum overlay.
         Isi "none" kalau mau overlay saja tanpa tone warna.
  fit    "cover" (default, penuh + crop) atau "contain" (muat seluruh
         overlay, ada letterbox) — cocok untuk overlay bingkai penuh.

CARA KERJA
----------
Overlay otomatis:
  1. Tampil di preview kamera (di atas video, di bawah UI).
  2. Masuk ke thumbnail chip filter.
  3. DI-BAKE ke setiap foto saat tombol shutter jalan — jadi hasil
     unduhan punya efek yang sama.

Contoh ide overlay: glow pink lembut, vignette gelap, light leak retro,
kilau bintang, gradasi sinar matahari, bingkai polaroid, dsb.

REFRESH BROWSER setelah menaruh file — folder di-scan ulang setiap kali
halaman capture dibuka. Tidak perlu build ulang.
