import fs from 'node:fs';
import path from 'node:path';
import {
  scanBooth,
  saveBoothTemplate,
  createBoothTemplate,
  deleteBoothTemplate,
  loadBoothCategories,
  saveBoothCategories,
  boothLeaderboardEntries,
  bumpBoothUsage,
  loadBoothShowcase,
  saveBoothShowcase,
} from './server/booth-scan.js';
import { scanMusic } from './server/music-scan.js';

/**
 * Dev middleware: serve drop-in template/sticker/music manifests as JSON,
 * plus PUT /api/booth/templates/<id> — simpan pengaturan frame dari editor
 * admin web (#/admin) langsung ke public/booth/templates/<id>/template.json.
 * (Di dev tidak perlu login; production pakai server Express + password.)
 */
export default function boothPlugin() {
  // Hanya menulis manifest statis saat BUILD (bukan saat dev server ditutup).
  let isBuild = false;

  return {
    name: 'booth-drop-in',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use('/api/booth', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

        // GET /api/booth/admin-status — di dev tidak ada login (server lokal).
        if (url.pathname === '/admin-status') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ authRequired: false, authConfigured: false }));
          return;
        }

        // POST /api/booth/templates — upload frame baru (dev, tanpa login).
        // Body = file gambar mentah; metadata lewat query ?name=&category=&slots=.
        if (req.method === 'POST' && url.pathname === '/templates') {
          const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          const extMap = {
            'image/png': 'png',
            'image/jpg': 'jpg',
            'image/jpeg': 'jpg',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'image/gif': 'gif',
            'image/avif': 'avif',
          };
          // Semua image/* diterima (fallback .png) — hanya non-gambar yang ditolak.
          if (!(mime.startsWith('image/') || mime === 'application/octet-stream')) {
            res.statusCode = 415;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `format tidak didukung (${mime || 'tanpa tipe'}) — pakai PNG, JPG, WebP, atau SVG` }));
            return;
          }
          const ext = extMap[mime] ?? 'png';
          const name = String(url.searchParams.get('name') ?? '').trim().slice(0, 80);
          if (!name) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'name required' }));
            return;
          }
          const category = String(url.searchParams.get('category') ?? '').trim().slice(0, 40);
          const slots = Number(url.searchParams.get('slots')) || 3;
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              const created = createBoothTemplate('public', {
                name,
                category,
                slots,
                ext,
                buffer: Buffer.concat(chunks),
              });
              if (!created) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'gagal menulis folder template' }));
                return;
              }
              res.statusCode = 201;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, id: created.id }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err?.message ?? err) }));
            }
          });
          return;
        }

        // PUT /api/booth/templates/<id>  — simpan template.json (dev).
        if (req.method === 'PUT' && url.pathname.startsWith('/templates/')) {
          const id = decodeURIComponent(url.pathname.slice('/templates/'.length));
          if (!/^[\w-]+$/.test(id)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid id' }));
            return;
          }
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const patch = JSON.parse(body);
              const file = saveBoothTemplate('public', id, patch);
              if (!file) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'template not found' }));
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, file: path.relative(process.cwd(), file) }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err?.message ?? err) }));
            }
          });
          return;
        }

        // DELETE /api/booth/templates/<id> — hapus frame drop-in (folder + isi).
        if (req.method === 'DELETE' && url.pathname.startsWith('/templates/')) {
          const id = decodeURIComponent(url.pathname.slice('/templates/'.length));
          if (!/^[\w-]+$/.test(id)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid id' }));
            return;
          }
          const deleted = deleteBoothTemplate('public', id);
          if (!deleted) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'template not found' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // GET /api/booth/categories — daftar kategori global (halaman developer).
        if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/categories') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ categories: loadBoothCategories('public') }));
          return;
        }

        // PUT /api/booth/categories — simpan daftar kategori (tambah/hapus).
        if (req.method === 'PUT' && url.pathname === '/categories') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (!parsed || !Array.isArray(parsed.categories)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid categories' }));
                return;
              }
              const saved = saveBoothCategories('public', parsed.categories);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, categories: saved }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err?.message ?? err) }));
            }
          });
          return;
        }

        // POST /api/booth/usage — catat pemakaian frame (leaderboard).
        if (req.method === 'POST' && url.pathname === '/usage') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const id = String(JSON.parse(body)?.id ?? '');
              const count = bumpBoothUsage('public', id);
              if (count === null) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid id' }));
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, id, count }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err?.message ?? err) }));
            }
          });
          return;
        }

        // PUT /api/booth/showcase — simpan konfigurasi showcase homepage
        // (bentuk tampilan + daftar frame terpilih, maks. 5) — dev tanpa login.
        if (req.method === 'PUT' && url.pathname === '/showcase') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) ?? {};
              const patch = {};
              if (typeof parsed.shape === 'string') patch.shape = parsed.shape;
              if (Array.isArray(parsed.frames)) patch.frames = parsed.frames;
              if (patch.shape === undefined && patch.frames === undefined) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid showcase patch' }));
                return;
              }
              const saved = saveBoothShowcase('public', patch);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, ...saved }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err?.message ?? err) }));
            }
          });
          return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.end();
          return;
        }

        // GET /api/booth — manifest segar tiap request (drop files, refresh).
        // Kategori global dari public/booth/categories.json (dibuat lewat halaman dev).
        const manifest = scanBooth('public');
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ...manifest,
            categories: loadBoothCategories('public'),
            leaderboard: boothLeaderboardEntries('public'),
            showcase: loadBoothShowcase('public'),
          }),
        );
      });

      server.middlewares.use('/api/music', (_req, res) => {
        const manifest = scanMusic('public');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(manifest));
      });

      // Dev: ganti template.json dari admin web butuh fs tulis — pastikan
      // folder templates ada supaya error jelas kalau path salah.
      try {
        fs.mkdirSync(path.join('public', 'booth', 'templates'), { recursive: true });
      } catch {
        /* best-effort */
      }
    },

    /**
     * Saat BUILD (npm run build / deploy ke Vercel dsb.): tulis manifest
     * statis ke dist/booth-manifest.json & dist/music-manifest.json.
     *
     * Hosting statis tidak punya endpoint /api/booth & /api/music, jadi tanpa
     * file ini semua frame/stiker/filter drop-in + musik hilang dari situs
     * (katalog JSON bawaan kosong — lihat src/data/templates.json = []).
     * Frontend memakai file ini sebagai cadangan kalau API tidak tersedia.
     */
    closeBundle() {
      if (!isBuild) return;
      try {
        const outDir = path.resolve('dist');
        fs.mkdirSync(outDir, { recursive: true });
        const manifest = {
          ...scanBooth('public'),
          categories: loadBoothCategories('public'),
          leaderboard: boothLeaderboardEntries('public'),
          showcase: loadBoothShowcase('public'),
        };
        fs.writeFileSync(path.join(outDir, 'booth-manifest.json'), JSON.stringify(manifest));
        fs.writeFileSync(path.join(outDir, 'music-manifest.json'), JSON.stringify(scanMusic('public')));
      } catch (err) {
        // Jangan gagalkan build karena manifest cadangan — situs tetap jalan
        // lewat /api/* kalau server Express ikut dideploy.
        console.warn('[booth-plugin] manifest statis gagal ditulis:', err?.message ?? err);
      }
    },
  };
}
