# SUMBER ARTWORK TEMPLATE BINGKAI (20 tema)

Semua dekorasi di `public/booth/templates/*/frame.png` diambil dari internet —
situs **PNGAll** (https://www.pngall.com), galeri PNG transparan gratis
(lisensi: boleh dipakai untuk proyek pribadi/non-komersial dengan kredit).
Setiap `frame.png` adalah komposit: artwork PNGAll + layout bingkai yang
disusun otomatis oleh `scripts/generate_themed_frames.py`.

| Folder | Tema | Gambar sumber (PNGAll) |
|---|---|---|
| birthday | Ulang Tahun | Frame-Happy-Birthday-Balloons-PNG |
| wedding | Pernikahan | Wedding-Border-PNG-HD-Image |
| christmas | Natal | Christmas-Frame-Background-PNG |
| halloween | Halloween | Halloween-Frame-Ghost-Pumpkin-PNG |
| valentine | Valentine | Valentine-Heart |
| retro-film | Retro Film | Vintage-Polaroid-Frame-PNG |
| summer-beach | Summer Beach | Summer-Vibes-Palm-Tree-Silhouette-PNG |
| tropical | Tropis | Green-Tropical-Frame-Leaf-Circular-PNG |
| floral-bloom | Bunga | Floral-Frame-PNG-High-Quality-Image |
| neon-nights | Neon Nights | Neon-Light-Rainbow-Wings-PNG |
| gold-luxury | Kemewahan Emas | Simple-Frame-Ornate-Gold-Border-Vector-PNG |
| graduation | Wisuda | Graduation-Cap-PNG-Images |
| new-year | Tahun Baru | Dynamic-Fireworks-Border-Graphic-PNG |
| outer-space | Luar Angkasa | Rocket-To-Moon-Universe-Exploration-PNG |
| coffee-time | Kedai Kopi | International-Coffee-Day-Steaming-Cup-With-Stars-Vector-PNG |
| soccer | Sepak Bola | Pink-Soccer-Ball-with-Textured-Pattern-PNG |
| music-notes | Musik | Whimsical-Music-Note-Border-Accent-PNG |
| kawaii-cute | Kawaii | Cute-Rabbit-Sitting-With-Pink-Cheeks-Cartoon-PNG |
| safari-jungle | Safari Liar | Cartoon-Lion-Waving-Paw-Sitting-PNG |
| starry-night | Malam Berbintang | Golden-Moon-Surface-Covered-With-Craters-And-Wispy-Clouds-PNG |

URL lengkap ada di header komentar `scripts/generate_themed_frames.py`
dan bisa dibuka ulang lewat pencarian di https://www.pngall.com.

## Cara regenerasi / ganti artwork

1. Simpan PNG transparan baru (bebas dari mana saja) di satu folder, misal `/tmp/deco`.
2. Sesuaikan tema di list `THEMES` dalam `scripts/generate_themed_frames.py`
   (warna, judul, kategori, kata kunci, nama file dekorasi).
3. Jalankan:
   python scripts/generate_themed_frames.py <folder-dekorasi> public/booth/templates
4. Refresh browser — scanner drop-in membaca ulang folder setiap halaman dibuka.

Posisi lubang foto diatur di konstanta `SLOT_*` (satu tempat untuk semua tema),
jadi `frame.png` dan `template.json` tidak akan pernah meleset satu sama lain.
