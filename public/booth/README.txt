FOLDER DROP-IN — taruh file di sini tanpa ubah kode
====================================================

TEMPLATE (bingkai foto)
------------------------
Tiga susunan folder didukung (campur boleh) — nama folder menentukan
kategori dan jumlah slot otomatis:

  public/booth/templates/<nama>/                 polos
  public/booth/templates/<kategori>/<nama>/      kategori = nama folder
  public/booth/templates/<kategori>/<slot>/<nama>/
                                                 slot = "1".."5" = jumlah foto
  public/booth/templates/<slot>/<nama>/          tanpa kategori

Isi tiap folder template:
  frame.png        (WAJIB — overlay bingkai, area foto dibuat TRANSPARAN;
                    slot default mengikuti jumlah foto, kalau tidak ada
                    folder slot defaultnya 3 foto bertumpuk vertikal)
  thumb.png        (opsional — preview kecil di picker; kalau tidak ada,
                    frame.png dipakai)
  template.json    (opsional tapi PENTING — atur posisi slot supaya hasil
                    kamera PAS masuk lubang frame-mu; lihat bawah)

MUDAHNYA: atur lewat STUDIO FRAME di halaman web #/admin — halaman khusus
developer yang dibuka lewat gerbang tersembunyi: tekan logo "fotome." di
header 7x berturut-turut, masukkan password. Di sana: geser & resize lubang
foto langsung di atas frame (tanpa hitung koordinat), putar dengan knob di
atas lubang, atur rotasi/zoom isi foto seperti stiker, lalu Simpan.
Hasilnya ditulis ke template.json di folder ini, langsung aktif.
Frame baru juga bisa langsung di-upload dari #/admin (tombol "＋ Frame baru")
— tidak perlu salin file manual.

Contoh susunan:
  templates/cute/3/strip-pink/frame.png   -> kategori "cute", 3 jepretan
  templates/party/5/grid/frame.png        -> kategori "party", 5 jepretan

template.json — bikin hasil kamera PAS
----------------------------------------
Ukuran frame PNG bebas, tapi posisi slot selalu dihitung dalam canvas
template (default 1080x1920). Contoh lengkap:

  {
    "name": "Strip Pink",
    "category": "cute",
    "keywords": ["pink", "imut"],
    "description": "Frame pink 3 foto.",
    "canvas": { "width": 1080, "height": 1920 },
    "background": "#ffffff",
    "photoSlots": [
      { "photoIndex": 0, "x": 90, "y": 100,  "width": 900, "height": 520 },
      { "photoIndex": 1, "x": 90, "y": 652,  "width": 900, "height": 520 },
      { "photoIndex": 2, "x": 90, "y": 1204, "width": 900, "height": 520, "fit": "contain", "rotation": -8, "scale": 1.15 }
    ]
  }

Field:
  canvas       ukuran koordinat template (default 1080x1920). Kalau PNG-mu
               bukan 1080x1920 (misal 1200x1800), tulis di sini supaya
               angka slot gampang dibandingkan langsung dengan PNG.
  background   warna CSS atau path gambar latar (di bawah foto).
  photoSlots   posisi lubang foto: x, y = pojok kiri-ATAS slot;
               width, height = ukuran slot; photoIndex = foto ke-1/2/3 (0-2).
               fit: "cover" (default, penuh + crop) atau "contain" (muat
               seluruh foto, ada letterbox).
  fit          per slot, lihat atas.
  rotation     per slot, derajat — foto di dalam slot ikut miring
               (positif = searah jarum jam). Default 0.
  scale        per slot, zoom isi foto di dalam slot (1 = pas,
               >1 lebih dekat). Default 1.

CARA NYESUAIN BIAR PAS
----------------------
CARA MUDAH (tanpa hitung koordinat):
1. Taruh frame.png di folder template, refresh browser.
2. Buka halaman #/admin (tekan logo fotome 7x, login password developer).
3. Klik frame-mu, seret lubang foto supaya pas dengan lubang di frame,
   ubah ukurannya lewat titik sudut, putar lewat knob di atas lubang,
   tekan SIMPAN. Selesai — aktif langsung.
Atau: tekan "＋ Frame baru" di #/admin, pilih PNG-mu, isi nama & jumlah foto
— frame langsung terunggah tanpa perlu akses server.

CARA MANUAL (edit template.json):
1. Taruh frame.png di folder template (tanpa template.json dulu), refresh
   browser, buka halaman AMBIL FOTO.
2. Klik frame-mu — preview besar muncul dengan foto demo.
3. Tekan tombol "Ganti Foto Demo" di bawah preview. Urutan foto demo
   bergeser antar slot — posisi tiap lubang terlihat jelas di atas frame.
4. Bandingkan dengan lubang di frame.png-mu:
   - Slot kegeser? ubah x / y di template.json.
     (ingat: x,y = pojok KIRI ATAS slot, bukan tengah)
   - Ukuran beda? ubah width / height.
   - Salipan kurang pas? ubah canvas sesuai ukuran PNG-mu lalu ukur ulang.
5. Simpan template.json di folder yang sama, refresh browser, cek lagi
   dengan "Ganti Foto Demo". Ulangi sampai rapi.
6. Foto muka kepangkas keras? tambahkan "fit": "contain" di slot itu.

Tips ukur cepat: buka frame.png di editor gambar apa pun, hover lubang
fotonya untuk baca koordinat pojok kiri atas + ukuran lubang, tulis ke
photoSlots. Kalau frame mengelilingi seluruh canvas, x = (1080 - width)/2.

Contoh: public/booth/templates/birthday/frame.png

STIKER
------
public/booth/stickers/<Kategori>/<file>.png
  Nama folder = nama kategori (otomatis muncul di UI).
  Kalau file langsung di folder stickers/ tanpa subfolder -> kategori "misc".

Contoh:
  public/booth/stickers/cute/panda.png      -> kategori "cute"
  public/booth/stickers/party/topi.png      -> kategori "party"
  public/booth/stickers/bintang.png         -> kategori "misc"

FILTER KAMERA (OVERLAY)
-----------------------
public/booth/filters/<nama-folder>/overlay.png   (WAJIB)
public/booth/filters/<nama-folder>/filter.json   (opsional: name, css, fit)
public/booth/filters/<nama-folder>/thumb.png     (opsional)

  Overlay otomatis tampil di preview kamera + chip filter, dan DI-BAKE
  ke setiap foto yang diambil. Detail lengkap: public/booth/filters/README.txt
  Contoh: public/booth/filters/contoh-glow/

REFRESH BROWSER setelah menaruh file — folder di-scan ulang setiap kali
halaman capture/editor dibuka. Tidak perlu build ulang.
