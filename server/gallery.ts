/**
 * Public gallery (galeri publik).
 * - Semua orang bisa melihat foto yang sudah disetujui developer.
 * - Hanya developer (password / cookie admin) yang bisa upload ke galeri.
 * - Upload: foto disimpan sementara di /tmp/photobooth/gallery, lalu diteruskan
 *   ke Google Drive (jika dikonfigurasi) dan dicache lokal supaya galeri tetap
 *   tampil walau Drive sedang tidak bisa diakses.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { checkPassword, createSession, destroySession, isValidAdmin, requireAdmin, isAuthConfigured, devBypass } from './auth.js';
import { driveConfigured, uploadToDrive } from './gdrive.js';

const GALLERY_ROOT = process.env.GALLERY_DIR ?? '/tmp/photobooth/gallery';
const META_FILE = path.join(GALLERY_ROOT, 'meta.json');
const MAX_ITEMS = 200;
const MAX_BODY = '48mb';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface GalleryPhoto {
  id: string;
  file: string;
  title: string;
  template: string;
  driveId: string | null;
  driveLink: string | null;
  size: number;
  createdAt: number;
  /** Ditandai developer → tampil di showcase homepage (foto pilihan). */
  featured?: boolean;
}

interface GalleryMeta {
  photos: GalleryPhoto[];
}

function emptyMeta(): GalleryMeta {
  return { photos: [] };
}

function loadMeta(): GalleryMeta {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf8');
    const data = JSON.parse(raw) as GalleryMeta;
    if (Array.isArray(data.photos)) return data;
  } catch {
    /* missing or corrupt -> start fresh */
  }
  return emptyMeta();
}

function saveMeta(meta: GalleryMeta): void {
  fs.mkdirSync(GALLERY_ROOT, { recursive: true });
  const tmp = META_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, META_FILE);
}

function newId(): string {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'strip'
  );
}

export interface GalleryStatus {
  driveConfigured: boolean;
  authConfigured: boolean;
  devBypass: boolean;
}

export function galleryStatus(): GalleryStatus {
  return {
    driveConfigured: driveConfigured(),
    authConfigured: isAuthConfigured() || devBypass(),
    devBypass: devBypass(),
  };
}

export const galleryRouter = express.Router();

// Status publik: apakah Drive & auth aktif (dipakai UI untuk menampilkan/menyembunyikan fitur).
galleryRouter.get('/status', (_req, res) => {
  res.json(galleryStatus());
});

// Daftar foto publik (tanpa file, hanya metadata + URL).
galleryRouter.get('/photos', (_req, res) => {
  const meta = loadMeta();
  res.json({
    photos: meta.photos.slice(0, MAX_ITEMS),
  });
});

// Foto aktual (dari cache lokal; file Drive diunduh developer manual via link).
galleryRouter.get('/photos/:id/img', (req, res) => {
  const meta = loadMeta();
  const photo = meta.photos.find((p) => p.id === req.params.id);
  if (!photo) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  // resolve() + cek prefix: sendFile butuh path absolut & blokir path traversal.
  const rootAbs = path.resolve(GALLERY_ROOT);
  const file = path.resolve(rootAbs, photo.file);
  if (!file.startsWith(rootAbs) || !fs.existsSync(file)) {
    res.status(404).json({ error: 'missing file' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(file);
});

// Foto pilihan developer untuk showcase homepage (publik, read-only).
// Maksimal 12 foto — sisanya tidak dikirim supaya beranda tetap ringan.
galleryRouter.get('/featured', (_req, res) => {
  const meta = loadMeta();
  res.json({
    photos: meta.photos.filter((p) => p.featured === true).slice(0, 12),
  });
});

// --- Admin-only dari sini ---

galleryRouter.post('/login', express.json({ limit: '10kb' }), (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!checkPassword(req.body?.password, ip)) {
    res.status(401).json({ error: 'wrong password' });
    return;
  }
  createSession(res);
  res.json({ ok: true });
});

galleryRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

galleryRouter.get('/me', (req, res) => {
  res.json({ admin: isValidAdmin(req) });
});

// Upload foto (multipart form: photo, title?, template?) — hanya developer.
galleryRouter.post(
  '/photos',
  requireAdmin,
  express.raw({ type: () => true, limit: MAX_BODY }),
  async (req, res) => {
    try {
      const contentType = req.headers['content-type'] ?? 'image/jpeg';
      const mime = contentType.split(';')[0]!.trim().toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        res.status(415).json({ error: 'unsupported media type' });
        return;
      }
      const body = req.body as Buffer | undefined;
      if (!body || body.length === 0) {
        res.status(400).json({ error: 'empty body' });
        return;
      }
      const title = sanitizeName(String(req.query.title ?? 'strip'));
      const template = sanitizeName(String(req.query.template ?? 'fotome'));
      const featured = String(req.query.featured ?? '') === '1';
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      const id = newId();
      const file = `${id}-${title}${ext}`;

      fs.mkdirSync(GALLERY_ROOT, { recursive: true });
      const filePath = path.join(GALLERY_ROOT, file);
      fs.writeFileSync(filePath, body);

      // Teruskan ke Google Drive kalau dikonfigurasi (best-effort; gagal tetap masuk galeri lokal).
      let driveId: string | null = null;
      let driveLink: string | null = null;
      if (driveConfigured()) {
        const up = await uploadToDrive(filePath, `${template}-${title}${ext}`, mime);
        if (up) {
          driveId = up.id;
          driveLink = up.webViewLink ?? `https://drive.google.com/file/d/${up.id}/view`;
        }
      }

      const meta = loadMeta();
      meta.photos.unshift({
        id,
        file,
        title,
        template,
        driveId,
        driveLink,
        size: body.length,
        createdAt: Date.now(),
        ...(featured ? { featured: true } : {}),
      });
      meta.photos = meta.photos.slice(0, MAX_ITEMS);
      saveMeta(meta);

      // Buang file lokal yang tidak masuk daftar lagi.
      for (const old of meta.photos.slice(MAX_ITEMS)) {
        void fsp.rm(path.join(GALLERY_ROOT, old.file), { force: true }).catch(() => undefined);
      }

      res.status(201).json({
        id,
        driveId,
        driveLink,
        title,
        template,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn('[gallery] upload failed:', err);
      res.status(500).json({ error: 'upload failed' });
    }
  },
);

// Tandai foto mana yang tampil di homepage (ceklis dari dashboard developer).
// Body: { ids: string[] } — urutan = urutan galeri; id di luar galeri diabaikan.
galleryRouter.put('/featured', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
  const body = req.body as { ids?: unknown } | undefined;
  if (!body || !Array.isArray(body.ids)) {
    res.status(400).json({ error: 'invalid ids' });
    return;
  }
  const wanted = new Set(body.ids.filter((v): v is string => typeof v === 'string'));
  const meta = loadMeta();
  let count = 0;
  for (const p of meta.photos) {
    if (wanted.has(p.id)) {
      p.featured = true;
      count++;
    } else {
      delete p.featured;
    }
  }
  saveMeta(meta);
  res.json({ ok: true, count, ids: meta.photos.filter((p) => p.featured === true).map((p) => p.id) });
});

// Ganti nama (judul) foto galeri — dipakai panel foto homepage di dashboard.
galleryRouter.put('/photos/:id', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
  const meta = loadMeta();
  const photo = meta.photos.find((p) => p.id === req.params.id);
  if (!photo) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  // Judul tampilan (bukan nama file): spasi dipertahankan, karakter berbahaya
  // dibuang, maksimal 80 karakter.
  const title = String((req.body as { title?: unknown })?.title ?? '')
    .trim()
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  photo.title = title;
  saveMeta(meta);
  res.json({ ok: true, title: photo.title });
});

// Hapus foto dari galeri (lokal; file Drive tidak dihapus — developer hapus manual).
galleryRouter.delete('/photos/:id', requireAdmin, (req, res) => {
  const meta = loadMeta();
  const idx = meta.photos.findIndex((p) => p.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const [removed] = meta.photos.splice(idx, 1);
  saveMeta(meta);
  if (removed) {
    void fsp.rm(path.join(GALLERY_ROOT, removed.file), { force: true }).catch(() => undefined);
  }
  res.json({ ok: true });
});
