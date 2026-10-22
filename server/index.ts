import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { startCleanupLoop } from './cleanup.js';
import { scanBooth, saveBoothTemplate, createBoothTemplate, deleteBoothTemplate, findTemplateDir, loadBoothCategories, saveBoothCategories, slugifyId, boothLeaderboardEntries, bumpBoothUsage, loadBoothShowcase, saveBoothShowcase } from './booth-scan.js';
import { scanMusic } from './music-scan.js';
import { galleryRouter } from './gallery.js';
import { devBypass, isAuthConfigured, isValidAdmin, requireAdmin } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());

// Small global rate limiter (no external store needed for one box).
const hits = new Map<string, { count: number; reset: number }>();
app.use((req, res, next) => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  let rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    rec = { count: 0, reset: now + 60_000 };
    hits.set(ip, rec);
  }
  rec.count++;
  if (rec.count > 600) {
    res.status(429).send('Too many requests');
    return;
  }
  next();
});

// Conservative security headers for a static booth.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Drop-in booth manifest (scanned fresh on every request: drop files, refresh).
app.get('/api/booth', (_req, res) => {
  const m = scanBooth(DIST);
  const publicRoot = path.resolve(DIST, '../public');
  // Kategori global dari public/booth/categories.json (dibuat lewat halaman dev).
  const globalCats = loadBoothCategories(publicRoot);
  // Leaderboard pemakaian frame + konfigurasi showcase homepage.
  const leaderboard = boothLeaderboardEntries(publicRoot);
  const showcase = loadBoothShowcase(publicRoot);
  res.json({ ...m, categories: globalCats, leaderboard, showcase });
});

// Catat pemakaian frame (tiap sesi capture selesai) — leaderboard frame.
// Publik & ringan; id divalidasi ketat (hanya \w dan -).
app.post('/api/booth/usage', express.json({ limit: '8kb' }), (req, res) => {
  const id = String((req.body as { id?: unknown })?.id ?? '');
  if (!/^[\w-]{1,80}$/.test(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const count = bumpBoothUsage(path.resolve(DIST, '../public'), id);
  if (count === null) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  res.json({ ok: true, id, count });
});

// Simpan konfigurasi showcase homepage (bentuk tampilan + daftar frame
// yang dicentang, maksimal 5) — hanya developer.
app.put('/api/booth/showcase', requireAdmin, express.json({ limit: '8kb' }), (req, res) => {
  const body = (req.body ?? {}) as { shape?: unknown; frames?: unknown };
  const patch: { shape?: string; frames?: string[] } = {};
  if (typeof body.shape === 'string') patch.shape = body.shape;
  if (Array.isArray(body.frames)) patch.frames = body.frames as string[];
  if (patch.shape === undefined && patch.frames === undefined) {
    res.status(400).json({ error: 'invalid showcase patch' });
    return;
  }
  const saved = saveBoothShowcase(path.resolve(DIST, '../public'), patch);
  res.json({ ok: true, ...saved });
});

// Status editor frame admin: apakah butuh login (password galeri yang sama).
app.get('/api/booth/admin-status', (req, res) => {
  res.json({
    authRequired: !devBypass() && !isValidAdmin(req),
    authConfigured: isAuthConfigured() || devBypass(),
  });
});

// Simpan pengaturan frame (posisi slot / kategori / nama) dari editor web
// admin → ditulis ke booth/templates/<id>/template.json (langsung aktif,
// tanpa build ulang). Dilindungi password GALLERY_ADMIN_PASSWORD.
app.put(
  '/api/booth/templates/:id',
  requireAdmin,
  express.json({ limit: '64kb' }),
  (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[\w-]+$/.test(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const patch = req.body as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      res.status(400).json({ error: 'invalid config' });
      return;
    }
    // Tulis ke folder yang di-scan (dist di production) DAN sumbernya (public)
    // supaya hasil edit tidak hilang saat build ulang.
    const roots = [DIST, path.resolve(DIST, '../public')];
    let written: string | null = null;
    for (const root of roots) {
      if (!fs.existsSync(path.join(root, 'booth', 'templates'))) continue;
      written = saveBoothTemplate(root, id, patch) ?? written;
    }
    if (!written) {
      res.status(404).json({ error: 'template not found' });
      return;
    }
    res.json({ ok: true });
  },
);

// Upload frame baru (developer): body = file gambar mentah, metadata lewat
// query (?name=&category=&slots=). Ditulis ke booth/templates/<id>/ —
// langsung aktif untuk semua pengunjung tanpa build ulang.
const UPLOAD_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
/** Semua `image/*` diterima (browser kadang kirim mime aneh utk file lama). */
const isImageMime = (mime: string): boolean => mime.startsWith('image/') || mime === 'application/octet-stream';

app.post(
  '/api/booth/templates',
  requireAdmin,
  express.raw({ type: (req) => {
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    return isImageMime(mime);
  }, limit: '48mb' }),
  (req, res) => {
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    const name = String(req.query.name ?? '').trim().slice(0, 80);
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!isImageMime(mime)) {
      res.status(415).json({ error: `format tidak didukung (${mime || 'tanpa tipe'}) — pakai PNG, JPG, WebP, atau SVG` });
      return;
    }
    const category = String(req.query.category ?? '').trim().slice(0, 40);
    const slots = Number(req.query.slots) || 3;
    const ext = UPLOAD_EXT[mime] ?? 'png';

    // Tulis ke SEMUA root yang ada: dist (langsung dipakai server) DAN public
    // (sumber build). Id harus sama di keduanya — pilih dulu id yang belum
    // terpakai di root mana pun, baru tulis memakai id itu (tanpa suffix)
    // supaya hasil edit/hapus admin tidak meleset dan frame tidak hilang
    // saat build ulang.
    const roots = [DIST, path.resolve(DIST, '../public')].filter((root) =>
      fs.existsSync(path.join(root, 'booth')),
    );
    if (roots.length === 0) {
      res.status(404).json({ error: 'folder booth/templates tidak ditemukan' });
      return;
    }
    const base = slugifyId(name);
    let id = base;
    let n = 2;
    const idTaken = (candidate: string): boolean =>
      roots.some((root) => fs.existsSync(path.join(root, 'booth', 'templates', candidate)));
    while (idTaken(id)) {
      id = `${base}-${n++}`;
      if (n > 500) {
        res.status(500).json({ error: 'terlalu banyak folder dengan nama sama' });
        return;
      }
    }
    let created: { id: string; dir: string } | null = null;
    for (const root of roots) {
      created = createBoothTemplate(root, { name, category, slots, ext, buffer: body, id }) ?? created;
    }
    if (!created) {
      res.status(500).json({ error: 'gagal menulis folder template' });
      return;
    }
    res.status(201).json({ ok: true, id: created.id });
  },
);

// Upload / ganti PREVIEW frame (thumb.png) dari halaman developer.
// Body = file gambar mentah; query ?rev= hanya cache-buster. Ditulis ke
// semua root yang ada (dist + public) supaya tidak hilang saat build ulang.
app.put(
  '/api/booth/templates/:id/thumb',
  requireAdmin,
  express.raw({
    type: (req) => {
      const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      return isImageMime(mime);
    },
    limit: '12mb',
  }),
  (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[\w-]+$/.test(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!isImageMime(mime)) {
      res.status(415).json({ error: `format tidak didukung (${mime || 'tanpa tipe'})` });
      return;
    }
    const ext = UPLOAD_EXT[mime] ?? 'png';
    const roots = [DIST, path.resolve(DIST, '../public')];
    let written = 0;
    for (const root of roots) {
      const dir = findTemplateDir(root, id);
      if (!dir) continue;
      // Tulis selalu sebagai thumb.png — booth-scan mencari thumb.*;
      // thumb lama berekstensi lain ikut dihapus supaya tidak bentrok.
      for (const f of fs.readdirSync(dir)) {
        if (/^thumb\.(png|jpe?g|webp|svg|gif|avif)$/i.test(f) && f !== `thumb.${ext}`) {
          fs.rmSync(path.join(dir, f));
        }
      }
      fs.writeFileSync(path.join(dir, `thumb.${ext}`), body);
      written++;
    }
    if (written === 0) {
      res.status(404).json({ error: 'template not found' });
      return;
    }
    res.json({ ok: true });
  },
);

// Hapus preview frame kustom — kembali memakai frame.png sebagai preview.
app.delete('/api/booth/templates/:id/thumb', requireAdmin, (req, res) => {
  const id = String(req.params.id ?? '');
  if (!/^[\w-]+$/.test(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const roots = [DIST, path.resolve(DIST, '../public')];
  let removed = false;
  for (const root of roots) {
    const dir = findTemplateDir(root, id);
    if (!dir) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^thumb\.(png|jpe?g|webp|svg|gif|avif)$/i.test(f)) {
        fs.rmSync(path.join(dir, f));
        removed = true;
      }
    }
  }
  res.json({ ok: true, removed });
});


// Daftar kategori global (halaman developer → centang kategori tiap frame).
app.get('/api/booth/categories', (_req, res) => {
  res.json({ categories: loadBoothCategories(path.resolve(DIST, '../public')) });
});

// Simpan daftar kategori global (tambah/hapus kategori dari halaman developer).
app.put(
  '/api/booth/categories',
  requireAdmin,
  express.json({ limit: '16kb' }),
  (req, res) => {
    const body = req.body as { categories?: unknown } | undefined;
    if (!body || !Array.isArray(body.categories)) {
      res.status(400).json({ error: 'invalid categories' });
      return;
    }
    // Tulis ke sumber (public) — file ini ikut ter-build saat npm run build.
    const root = path.resolve(DIST, '../public');
    if (!fs.existsSync(path.join(root, 'booth'))) {
      res.status(404).json({ error: 'folder booth tidak ditemukan' });
      return;
    }
    const saved = saveBoothCategories(root, body.categories as string[]);
    res.json({ ok: true, categories: saved });
  },
);

// Hapus frame drop-in (folder template beserta isinya) dari halaman developer.
app.delete('/api/booth/templates/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id ?? '');
  if (!/^[\w-]+$/.test(id)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const roots = [DIST, path.resolve(DIST, '../public')];
  let deleted = false;
  for (const root of roots) {
    if (!fs.existsSync(path.join(root, 'booth', 'templates'))) continue;
    deleted = deleteBoothTemplate(root, id) || deleted;
  }
  if (!deleted) {
    res.status(404).json({ error: 'template not found' });
    return;
  }
  res.json({ ok: true });
});

// Drop-in music manifest (scanned fresh on every request: drop files, refresh).
app.get('/api/music', (_req, res) => {
  res.json(scanMusic(DIST));
});

// Public gallery + developer-only upload (opsional forward ke Google Drive).
app.use('/api/gallery', galleryRouter);

// Immutable hashed assets, revalidate HTML.
app.use(
  express.static(DIST, {
    index: 'index.html',
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
    },
  }),
);

// SPA fallback for any other GET.
app.use((_req, res, next) => {
  if (_req.method !== 'GET') return next();
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res
    .status(503)
    .send('Build not found. Run "npm run build" first, then restart the server.');
});

app.listen(PORT, () => {
  console.log(`Photobooth server running on http://localhost:${PORT}`);
  console.log(`Serving ${DIST}`);
  startCleanupLoop();
});
