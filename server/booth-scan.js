/**
 * Booth drop-in scanner.
 * Scans public/booth/templates/** and public/booth/stickers/** for
 * user-supplied frames and stickers. No code changes needed — drop files, refresh.
 *
 * Templates — tiga susunan folder didukung (campur boleh):
 *   public/booth/templates/<nama>/frame.png              -> kategori dari template.json
 *   public/booth/templates/<kategori>/<nama>/frame.png   -> kategori = nama folder
 *   public/booth/templates/<kategori>/<slot>/<nama>/     -> slot = "1".."5" = jumlah foto
 *     frame.png        (required, overlay PNG; saran 1080x1920)
 *     thumb.png        (optional picker preview)
 *     template.json    (optional custom layout: name, category, photoSlots, ...)
 *
 * Stickers:   public/booth/stickers/<Category>/<file>.png  (category = folder name)
 *             public/booth/stickers/<file>.png             (category = "misc")
 * Filters:    public/booth/filters/<name>/overlay.png      (required, full-canvas overlay)
 *             public/booth/filters/<name>/filter.json      (optional: name, css, thumb, fit)
 *             -> a drop-in filter = a color/tone preset (css) + an overlay PNG
 *                (glow, vignette, light leak, sparkles, ...) drawn on top of
 *                the video AND baked into every captured photo.
 */
import fs from 'node:fs';
import path from 'node:path';

const IMG_RE = /\.(png|jpe?g|webp|svg)$/i;
const FRAME_RE = /^frame\.(png|jpe?g|webp|svg)$/i;
const THUMB_RE = /^thumb\.(png|jpe?g|webp|svg)$/i;
const OVERLAY_RE = /^overlay\.(png|jpe?g|webp|svg)$/i;
const IGNORE = ['thumbs', 'node_modules', '.DS_Store'];
/** Folder "1".."5" = jumlah slot foto, bukan kategori. */
const SLOT_DIR_RE = /^[1-5]$/;

export function scanBooth(publicDir) {
  const templates = [];
  const stickers = [];
  const filters = [];
  const tplRoot = path.join(publicDir, 'booth', 'templates');
  const stkRoot = path.join(publicDir, 'booth', 'stickers');
  const fltRoot = path.join(publicDir, 'booth', 'filters');

  // ---- templates (flat / per kategori / per slot) ----
  const pushTemplate = (dir, rel, files, category, slotHint) => {
    const frame = files.find((f) => FRAME_RE.test(f));
    if (!frame) return;
    const thumb = files.find((f) => THUMB_RE.test(f));
    let config = null;
    if (files.includes('template.json')) {
      try {
        config = JSON.parse(fs.readFileSync(path.join(dir, 'template.json'), 'utf8'));
      } catch {
        console.warn(`[booth] invalid template.json in ${rel}`);
      }
    }
    // Kategori bisa lebih dari satu: config.categories (array) menimpa
    // category tunggal. Folder kategori hanya dipakai untuk frame yang
    // NESTED (level ≥ 2, mis. templates/<kategori>/<nama>/frame.png).
    // Folder level-1 yang LANGSUNG berisi frame = nama folder frame
    // (layout datar hasil upload) — BUKAN kategori, supaya upload frame baru
    // tidak pernah bikin kategori baru diam-diam. Kategori hanya bertambah
    // lewat fitur "Kelola kategori" (public/booth/categories.json).
    const depth = rel ? rel.split('/').length : 0;
    const folderCat = depth > 1 ? category : null;
    const cfgCats = Array.isArray(config?.categories)
      ? config.categories.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
      : [];
    const cats = cfgCats.length > 0
      ? [...new Set([...cfgCats, ...(folderCat ? [folderCat] : [])])]
      : folderCat
        ? [folderCat]
        : [];
    templates.push({
      id: rel.replace(/[^A-Za-z0-9_-]/g, '-'),
      frame: `/booth/templates/${rel}/${frame}`,
      thumb: thumb ? `/booth/templates/${rel}/${thumb}` : null,
      category: cats[0] ?? null,
      categories: cats,
      slots: slotHint ?? null,
      config,
    });
  };

  const walkTemplates = (dir, rel, category, slotHint) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    if (files.some((f) => FRAME_RE.test(f))) {
      pushTemplate(dir, rel, files, category, slotHint);
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || IGNORE.includes(e.name)) continue;
      const slot = SLOT_DIR_RE.test(e.name) ? Number(e.name) : null;
      walkTemplates(
        path.join(dir, e.name),
        rel ? `${rel}/${e.name}` : e.name,
        // Kategori = folder pertama yang bukan angka slot.
        category ?? (slot === null ? e.name : null),
        slot ?? slotHint,
      );
    }
  };
  walkTemplates(tplRoot, '', null, null);

  // ---- stickers (recursive, folder = category) ----
  const walkStickers = (dir, rel, category) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORE.includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walkStickers(full, `${rel}/${e.name}`, category ?? e.name);
      } else if (IMG_RE.test(e.name)) {
        const id = (rel + '/' + e.name).replace(/^\//, '').replace(IMG_RE, '').replace(/[^\w-]/g, '-');
        stickers.push({
          id,
          name: e.name.replace(IMG_RE, '').replace(/[-_]/g, ' '),
          image: `/booth/stickers${rel}/${e.name}`,
          category: category ?? 'misc',
        });
      }
    }
  };
  walkStickers(stkRoot, '', null);

  // ---- filters (drop-in: css preset + overlay PNG) ----
  try {
    for (const name of fs.readdirSync(fltRoot)) {
      const dir = path.join(fltRoot, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const files = fs.readdirSync(dir);
      const overlay = files.find((f) => OVERLAY_RE.test(f));
      if (!overlay) {
        console.warn(`[booth] filter "${name}" dilewati — tidak ada overlay.png (lihat public/booth/filters/README.txt)`);
        continue;
      }
      let config = null;
      const cfgFile = files.find((f) => f === 'filter.json');
      if (cfgFile) {
        try {
          config = JSON.parse(fs.readFileSync(path.join(dir, cfgFile), 'utf8'));
        } catch {
          console.warn(`[booth] invalid filter.json in ${name}`);
        }
      }
      const thumb = files.find((f) => THUMB_RE.test(f));
      filters.push({
        id: name,
        name:
          typeof config?.name === 'string' && config.name.trim()
            ? config.name.trim()
            : name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        css: typeof config?.css === 'string' && config.css.trim() ? config.css.trim() : 'none',
        overlay: `/booth/filters/${name}/${overlay}`,
        thumb: thumb ? `/booth/filters/${name}/${thumb}` : null,
        fit: config?.fit === 'contain' ? 'contain' : 'cover',
      });
    }
  } catch {
    /* folder missing -> fine */
  }

  return { templates, stickers, filters };
}

/**
 * Daftar kategori global (dipakai halaman developer untuk centang kategori).
 * Disimpan di public/booth/categories.json — array string sederhana.
 */
const CATS_FILE = 'categories.json';

/**
 * Leaderboard pemakaian frame — public/booth/leaderboard.json
 * Format: { "<template-id>": <count> }. Dibump lewat POST /api/booth/usage
 * (tiap sesi capture selesai). 5 teratas tampil otomatis di homepage.
 */
const LEADER_FILE = 'leaderboard.json';
const MAX_USES = 1_000_000;

export function loadBoothLeaderboard(publicDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(publicDir, 'booth', LEADER_FILE), 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        if (/^[\w-]{1,80}$/.test(k) && Number.isFinite(Number(v)) && Number(v) > 0) {
          out[k] = Math.min(MAX_USES, Math.floor(Number(v)));
        }
      }
      return out;
    }
  } catch {
    /* belum ada file -> kosong */
  }
  return {};
}

function saveBoothLeaderboard(publicDir, board) {
  const file = path.join(publicDir, 'booth', LEADER_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(board, null, 2) + '\n');
}

/** Tambah 1 pemakaian untuk id frame. Return count baru, atau null kalau id invalid. */
export function bumpBoothUsage(publicDir, id) {
  if (!/^[\w-]{1,80}$/.test(String(id ?? ''))) return null;
  const board = loadBoothLeaderboard(publicDir);
  board[id] = Math.min(MAX_USES, (board[id] ?? 0) + 1);
  saveBoothLeaderboard(publicDir, board);
  return board[id];
}

/**
 * Leaderboard terurut (count turun) untuk manifest: [{ id, count }, ...].
 */
export function boothLeaderboardEntries(publicDir) {
  const board = loadBoothLeaderboard(publicDir);
  return Object.entries(board)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Konfigurasi showcase homepage — public/booth/showcase.json
 * { shape: "bunga" | ... (10 bentuk), frames: ["<template-id>", ...] }
 * - shape  : bentuk tampilan foto galeri (dipilih dashboard developer)
 * - frames : frame template yang dicentang tampil di beranda (maks. 5)
 */
const SHOWCASE_FILE = 'showcase.json';
export const MAX_SHOWCASE_FRAMES = 5;
export const SHOWCASE_SHAPES = [
  'grid',
  'bunga',
  'polaroid',
  'strip',
  'ring',
  'zigzag',
  'piramida',
  'domino',
  'kipas',
  'pita',
];
export const DEFAULT_SHOWCASE_SHAPE = 'bunga';

/**
 * Rapikan daftar frame homepage: hanya id aman (\w + -), tanpa duplikat,
 * maksimal MAX_SHOWCASE_FRAMES. Return null kalau input bukan array
 * (penanda "tidak diubah" untuk saveBoothShowcase).
 */
function cleanShowcaseFrames(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const raw of list) {
    const id = String(raw ?? '').trim();
    if (!/^[\w-]{1,80}$/.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_SHOWCASE_FRAMES) break;
  }
  return out;
}

export function loadBoothShowcase(publicDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(publicDir, 'booth', SHOWCASE_FILE), 'utf8'));
    const shape = SHOWCASE_SHAPES.includes(raw?.shape) ? raw.shape : DEFAULT_SHOWCASE_SHAPE;
    const frames = cleanShowcaseFrames(raw?.frames) ?? [];
    return { shape, frames };
  } catch {
    return { shape: DEFAULT_SHOWCASE_SHAPE, frames: [] };
  }
}

/**
 * Simpan konfigurasi showcase homepage.
 * patch: { shape?, frames? } — field yang tidak dikirim dipertahankan
 * (jadi mengubah bentuk tidak menghapus ceklis frame, dan sebaliknya).
 * String masih diterima (pemakaian lama: simpan shape saja).
 */
export function saveBoothShowcase(publicDir, patch) {
  const legacyShape = typeof patch === 'string' ? patch : undefined;
  const shapeIn = legacyShape ?? patch?.shape;
  const framesIn = legacyShape !== undefined ? undefined : patch?.frames;
  const cur = loadBoothShowcase(publicDir);
  const shape = typeof shapeIn === 'string' && shapeIn.length > 0
    ? (SHOWCASE_SHAPES.includes(shapeIn) ? shapeIn : DEFAULT_SHOWCASE_SHAPE)
    : cur.shape;
  const frames = framesIn === undefined ? cur.frames : (cleanShowcaseFrames(framesIn) ?? []);
  const file = path.join(publicDir, 'booth', SHOWCASE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ shape, frames }, null, 2) + '\n');
  return { shape, frames };
}

export function loadBoothCategories(publicDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(publicDir, 'booth', CATS_FILE), 'utf8'));
    if (Array.isArray(raw)) return raw.filter((c) => typeof c === 'string' && c.trim());
  } catch {
    /* belum ada file -> kosong */
  }
  return [];
}

export function saveBoothCategories(publicDir, list) {
  const clean = [...new Set((Array.isArray(list) ? list : [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean)
    .map((c) => c.slice(0, 40)))];
  const file = path.join(publicDir, 'booth', CATS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + '\n');
  return clean;
}

/**
 * Hapus frame drop-in (folder template beserta isinya) dari id manifest.
 * Return true kalau folder benar-benar terhapus.
 */
export function deleteBoothTemplate(publicDir, id) {
  const dir = findTemplateDir(publicDir, id);
  if (!dir) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * Cari folder fisik sebuah template dari id manifest (admin web editor).
 * Return path absolut folder template, atau null kalau tidak ketemu.
 */
export function findTemplateDir(publicDir, id) {
  const tplRoot = path.join(publicDir, 'booth', 'templates');
  let found = null;
  const walk = (dir, rel) => {
    if (found) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    if (files.some((f) => FRAME_RE.test(f))) {
      if (rel.replace(/[^A-Za-z0-9_-]/g, '-') === id) found = dir;
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || IGNORE.includes(e.name)) continue;
      walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    }
  };
  walk(tplRoot, '');
  return found;
}

/** Bikin id folder yang aman dari nama frame (hanya \w dan -). */
export function slugifyId(name) {
  return (
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'frame'
  );
}

/**
 * Frame baru dari upload developer: tulis frame.* + template.json ke
 * <publicDir>/booth/templates/<id>/. Kalau folder sudah ada, id diberi
 * sufiks -2, -3, … supaya tidak menimpa frame lama.
 * Return { id, dir } atau null kalau gagal.
 */
export function createBoothTemplate(publicDir, { name, category, slots, ext, buffer, id: fixedId }) {
  const tplRoot = path.join(publicDir, 'booth', 'templates');
  const base = slugifyId(name);
  let id = String(fixedId ?? '').trim() || base;
  let n = 2;
  // Tanpa fixedId: pilih sufiks -2, -3, … yang belum terpakai di root ini.
  // Dengan fixedId: pakai persis (dipakai server production supaya folder
  // dist & public selalu punya id yang sama).
  if (!fixedId) {
    while (fs.existsSync(path.join(tplRoot, id))) {
      id = `${base}-${n++}`;
      if (n > 500) return null;
    }
  }
  const dir = path.join(tplRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `frame.${ext}`), buffer);

  const slotCount = Math.min(5, Math.max(1, Number(slots) || 3));
  // Kategori upload HARUS berasal dari daftar "Kelola kategori"
  // (public/booth/categories.json). Nilai lain diabaikan — kategori tidak
  // boleh bertambah dari nama frame maupun input bebas.
  const managed = loadBoothCategories(publicDir);
  const rawCat = String(category ?? '').trim();
  const cat = managed.find((c) => c.toLowerCase() === rawCat.toLowerCase()) ?? '';
  const config = {
    name: String(name ?? '').trim() || id,
    ...(cat ? { category: cat, categories: [cat] } : {}),
    photoSlots: defaultVerticalSlots(slotCount),
  };
  fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify(config, null, 2) + '\n');
  return { id, dir };
}

/** Slot default: N foto bertumpuk vertikal di kanvas 1080x1920 (mirip klien). */
function defaultVerticalSlots(count) {
  const n = Math.min(5, Math.max(1, count));
  const w = 1080;
  const h = 1920;
  const mx = Math.round(w * 0.083);
  const top = Math.round(h * 0.052);
  const gap = Math.round(h * 0.017);
  const sw = w - mx * 2;
  const sh = Math.floor((h - top * 2 - gap * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => ({
    photoIndex: i,
    x: mx,
    y: top + i * (sh + gap),
    width: sw,
    height: sh,
  }));
}

/**
 * Simpan pengaturan frame dari editor web admin ke <folder>/template.json.
 * Field lama dipertahankan (mis. decals) — patch di-merge di atas config lama.
 * Return path file yang ditulis, atau null kalau template tidak ada.
 */
export function saveBoothTemplate(publicDir, id, patch) {
  const dir = findTemplateDir(publicDir, id);
  if (!dir) return null;
  const file = path.join(dir, 'template.json');
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* no / invalid template.json -> start fresh */
  }
  const merged = { ...existing, ...patch };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return file;
}
