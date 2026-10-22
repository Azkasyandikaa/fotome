FOLDER MUSIK — FOTOME
=====================

Tinggal drop file lagu ke folder ini, TANPA ubah kode. Refresh browser, lagu otomatis
muncul di daftar putar.

Cara pakai:
1. Taruh file audio di sini:  public/music/<nama-lagu>.mp3
   Format yang didukung browser: .mp3, .m4a, .aac, .ogg, .oga, .opus, .wav, .webm, .flac
2. (Opsional) Supaya urutan / judul rapi, buat playlist.json di folder ini:

   {
     "order": ["lagu-pertama.mp3", "lagu-kedua.mp3"],
     "titles": { "lagu-pertama.mp3": "Lagu Pertama" },
     "autoplay": true
   }

   - "order"  : urutan pemutaran. File yang tidak disebut tetap ikut, diposisikan
                setelahnya (urutan alfabetis).
   - "titles" : judul tampil di widget musik. Kalau tidak diisi, dipakai nama file.
   - "autoplay": false -> musik tidak menyala otomatis, pengunjung tinggal klik
                 tombol musik di pojok kanan bawah.

3. Refresh browser. Kalau masih versi production (npm run serve), tidak perlu build
   ulang — server membaca folder ini ulang setiap permintaan.

Tips:
- Gunakan nama file tanpa spasi: "hari-merdeka.mp3" lebih aman daripada "Hari Merdeka.mp3".
- Ukuran wajar (<= 8 MB per lagu) supaya loading cepat.
- Lagu ke-"X" diputar berurutan lalu balik lagi ke awal (loop semua).

PENTING: kalau folder ini masih kosong, widget musik SENGAJA disembunyikan dan
tidak ada suara — bukan bug. Sudah taruh mp3 tapi masih bisu? Cek:
- ekstensi file didukung (.mp3/.m4a/.ogg/.wav/.opus/.flac dst.), lalu refresh browser;
- beberapa browser memblokir autoplay sampai ada klik/ketuk pertama — klik sekali
  di mana saja di halaman, lagu mulai sendiri.
