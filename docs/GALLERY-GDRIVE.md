# Galeri Publik + Upload Google Drive

Alur baru: setelah pencet **download** foto, muncul notifikasi
*"Masukkan foto ini ke galeri via Google Drive?"*. Foto yang disetujui akan
dikirim server ke **Google Drive**, lalu muncul di tab **Galeri Publik**.

**Hanya developer** yang bisa mengirim foto ke galeri — pengunjung biasa hanya
melihat & mengunduh. Login memakai password (sekali login, sesi disimpan di
cookie ~12 jam).

---

## 1. Environment variable (server)

| Variabel | Wajib? | Fungsi |
|---|---|---|
| `GALLERY_ADMIN_PASSWORD` | wajib untuk fitur galeri | Password login developer. Tanpa ini, fitur galeri nonaktif (UI menyembunyikan upload). |
| `GDRIVE_SERVICE_ACCOUNT_FILE` | opsional | Path file JSON service account. Default: `gdrive-service-account.json` di root project. |
| `GDRIVE_FOLDER_ID` | opsional | ID folder Google Drive tujuan upload. Kosong = upload ke root Drive service account. |
| `GALLERY_DEV_BYPASS` | dev only | Set `1` untuk bypass login di lingkungan lokal. **Jangan dipakai di produksi.** |
| `GALLERY_DIR` | opsional | Folder cache foto di server. Default: `/tmp/photobooth/gallery` (Windows: buat folder lokal, mis. `./data/gallery`). |

Contoh menjalankan server produksi:

```bash
GALLERY_ADMIN_PASSWORD="password-rahasia" \
GDRIVE_FOLDER_ID="1AbC..." \
node dist-server/index.js
```

## 2. Setup Google Drive (service account)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project (atau pakai yang ada).
2. Menu **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   - Nama bebas, mis. `fotome-gallery`.
   - Tidak perlu role khusus — langsung **Done**.
4. Buka service account itu → tab **Keys → Add key → Create new key → JSON**.
   - File JSON terunduh. Simpan sebagai `gdrive-service-account.json` di root project
     (sudah masuk `.gitignore`, tidak akan ter-commit).
   - Atau simpan di tempat lain dan set `GDRIVE_SERVICE_ACCOUNT_FILE=/path/ke/file.json`.
5. (Opsional tapi disarankan) buat folder di Google Drive untuk galeri:
   - Buat folder baru di Drive-mu, mis. "Fotome Gallery".
   - **Share** folder itu ke email service account (lihat field `client_email`
     di JSON) dengan peran **Editor**.
   - Salin **folder ID** dari URL (`https://drive.google.com/drive/folders/<FOLDER_ID>`)
     dan set sebagai `GDRIVE_FOLDER_ID`.

> Tanpa `GDRIVE_FOLDER_ID`, file ter-upload masuk ke storage milik service
> account (bukan terlihat di Drive pribadimu) — link tetap bisa dibuka lewat
> `webViewLink` yang dikembalikan server.

Kalau Drive belum dikonfigurasi: fitur upload galeri **tetap jalan** — foto
tersimpan di cache server dan ditandai tanpa badge "Drive". Begitu service
account dipasang, upload berikutnya otomatis diteruskan ke Drive.

## 3. Cara pakai (sebagai developer)

1. Ambil foto seperti biasa → **Unduh** di editor.
2. Modal sukses muncul + kotak **"Masukkan foto ini ke galeri via Google Drive?"**.
3. Klik **YA, SIMPAN KE GALERI**:
   - Belum login → muncul prompt password developer.
   - Setelah login, upload berjalan dengan progress bar.
   - Foto langsung tampil di halaman **Galeri → Galeri Publik**.
4. Klik **TIDAK** kalau tidak mau membagikan foto itu.

Pengunjung lain: buka **Galeri**, tab **Galeri Publik**, klik foto untuk
lightbox, unduh lewat tombol. Mereka **tidak bisa** upload/menghapus apa pun.

## 4. Mode development

```bash
# Terminal 1: server Express (API galeri) di port 8787
GALLERY_DEV_BYPASS=1 GALLERY_DIR=./data/gallery PORT=8787 npm run serve

# Terminal 2: Vite dev server (proxy /api/gallery -> 8787)
npm run dev
```

Di dev, `GALLERY_DEV_BYPASS=1` membuat upload tidak butuh password. Login di UI
tetap bisa dipakai dengan `GALLERY_ADMIN_PASSWORD` tanpa bypass.

## 5. Catatan teknis

- Endpoint galeri:
  - `GET  /api/gallery/status`  — status fitur (publik)
  - `GET  /api/gallery/photos`  — daftar foto (publik)
  - `GET  /api/gallery/photos/:id/img` — gambar (publik, cache 1 hari)
  - `POST /api/gallery/login` | `logout` | `GET me` — sesi developer
  - `POST /api/gallery/photos`  — upload (admin saja)
  - `DELETE /api/gallery/photos/:id` — hapus dari galeri (admin saja)
- Upload dibatasi 12 MB, tipe `image/jpeg|png|webp`, maks 200 foto (terbaru).
- Cache lokal server ada di `GALLERY_DIR` + `meta.json` (atomic write).
- Foto di Drive **tidak dihapus** saat hapus dari galeri — bersihkan manual via Drive.
