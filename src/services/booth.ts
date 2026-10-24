import type { FilterDef, StickerDef, TemplateDef } from '../types';
import { loadImageCached } from './canvas';

export interface BoothTemplateEntry {
  id: string;
  frame: string;
  thumb: string | null;
  /** Kategori utama dari nama folder (null kalau flat & tak ada di template.json). */
  category: string | null;
  /** Semua kategori frame (dari config.categories; fallback: category tunggal). */
  categories: string[];
  /** Jumlah slot dari nama folder "1".."5" (null kalau buka folder slot). */
  slots: number | null;
  config: Record<string, unknown> | null;
}

export interface BoothStickerEntry {
  id: string;
  name: string;
  image: string;
  category: string;
}

export interface BoothFilterEntry {
  id: string;
  name: string;
  css: string;
  overlay: string;
  thumb: string | null;
  fit: 'cover' | 'contain';
}

interface BoothManifest {
  templates: BoothTemplateEntry[];
  stickers: BoothStickerEntry[];
  filters?: BoothFilterEntry[];
  /** Kategori global (dari public/booth/categories.json, halaman developer). */
  categories?: string[];
  /** Leaderboard pemakaian frame (count turun) — 5 teratas tampil di homepage. */
  leaderboard?: BoothLeaderboardEntry[];
  /** Konfigurasi showcase homepage (bentuk tampilan + frame terpilih). */
  showcase?: { shape?: string; frames?: string[] };
}

export interface BoothLeaderboardEntry {
  id: string;
  count: number;
}

/** Entries from src/data/*.json (the "built-in" catalog). */
import templateData from '../data/templates.json';
import stickerData from '../data/stickers.json';
import filterData from '../data/filters.json';

const jsonTemplates = templateData as TemplateDef[];
const jsonStickers = stickerData as StickerDef[];
const jsonFilters = filterData as FilterDef[];

let templates: TemplateDef[] = jsonTemplates;
let stickers: StickerDef[] = jsonStickers;
let filters: FilterDef[] = [];
let loaded = false;
let pending: Promise<void> | null = null;
/** Nomor urut fetch terakhir — hasil fetch lama boleh dibuang. */
let fetchSeq = 0;

/** 10 bentuk tampilan showcase homepage — dipilih di dashboard developer. */
export const SHOWCASE_SHAPES: { id: string; label: string; icon: string }[] = [
  { id: 'grid', label: 'Grid Klasik', icon: '▦' },
  { id: 'bunga', label: 'Tumpuk Bunga', icon: '❀' },
  { id: 'polaroid', label: 'Kolase Polaroid', icon: '📷' },
  { id: 'strip', label: 'Strip Vertikal', icon: '▤' },
  { id: 'ring', label: 'Cincin', icon: '⭕' },
  { id: 'zigzag', label: 'Zigzag', icon: '⌇' },
  { id: 'piramida', label: 'Piramida', icon: '▲' },
  { id: 'domino', label: 'Air Terjun', icon: '💠' },
  { id: 'kipas', label: 'Kipas', icon: '🪭' },
  { id: 'pita', label: 'Pita Berjalan', icon: '🎀' },
];
export const DEFAULT_SHOWCASE_SHAPE = 'bunga';
/** Maksimal frame yang boleh dicentang tampil di homepage. */
export const MAX_SHOWCASE_FRAMES = 5;

export function isValidShowcaseShape(shape: string): boolean {
  return SHOWCASE_SHAPES.some((s) => s.id === shape);
}

/** Kategori global dari halaman developer (di-set saat manifest diterima). */
let globalCategories: string[] = [];

/** Leaderboard pemakaian frame (di-set saat manifest diterima). */
let leaderboard: BoothLeaderboardEntry[] = [];

/** Bentuk tampilan showcase homepage (10 pilihan, default "bunga"). */
let showcaseShape: string = DEFAULT_SHOWCASE_SHAPE;

/**
 * Frame template yang dicentang developer untuk homepage (maks. 5).
 * Id = TemplateDef (drop-in "booth-<folder>" atau id katalog bawaan).
 */
let showcaseFrames: string[] = [];

/** Kategori global dari halaman developer. */
export function getBoothGlobalCategories(): string[] {
  return globalCategories;
}

/** Leaderboard frame (count turun) — dipakai homepage & dashboard. */
export function getBoothLeaderboard(): BoothLeaderboardEntry[] {
  return leaderboard;
}

/** Bentuk showcase homepage yang sedang aktif. */
export function getBoothShowcaseShape(): string {
  return showcaseShape;
}

/** Daftar frame homepage yang sedang dicentang di dashboard (urut tampil). */
export function getBoothShowcaseFrames(): string[] {
  return showcaseFrames;
}

/**
 * Catat pemakaian frame (dipanggil saat sesi capture selesai) → leaderboard.
 * Fire-and-forget: gagal jaringan / mode statis bukan masalah.
 */
export async function reportFrameUse(templateId: string): Promise<void> {
  try {
    // Normalisasi: TemplateDef drop-in ber-id "booth-<folder>" — leaderboard
    // memakai id folder (ruang id yang sama dengan manifest entries).
    const id = templateId.replace(/^booth-/, '');
    await fetch('/api/booth/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch {
    /* offline / tanpa server — leaderboard hanya tumbuh saat server ada */
  }
}

/** Simpan bentuk showcase homepage (dashboard developer). Return bentuk tersimpan. */
export async function saveShowcaseShape(shape: string): Promise<string> {
  const res = await fetch('/api/booth/showcase', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
  const data = (await res.json()) as { shape?: string };
  showcaseShape = isValidShowcaseShape(data.shape ?? '') ? data.shape! : DEFAULT_SHOWCASE_SHAPE;
  return showcaseShape;
}

/**
 * Simpan ceklis frame homepage (maks. MAX_SHOWCASE_FRAMES, urut centang).
 * Return daftar tersimpan dari server (sudah dirapikan server).
 */
export async function saveShowcaseFrames(frames: string[]): Promise<string[]> {
  const clean = [...new Set(frames.map((f) => String(f).trim()).filter(Boolean))].slice(0, MAX_SHOWCASE_FRAMES);
  const res = await fetch('/api/booth/showcase', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames: clean }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
  const data = (await res.json()) as { frames?: unknown };
  showcaseFrames = Array.isArray(data.frames)
    ? data.frames.filter((f): f is string => typeof f === 'string').slice(0, MAX_SHOWCASE_FRAMES)
    : clean;
  return showcaseFrames;
}

/**
 * Slot bawaan untuk frame tanpa template.json: N foto bertumpuk vertikal.
 * N datang dari nama folder slot ("1".."5"), default 3 — sama dengan
 * susunan lama x=90 y=100/652/1204 ukuran 900x520 di kanvas 1080x1920.
 */
export function defaultSlots(count: number, w: number, h: number): TemplateDef['engine']['photoSlots'] {
  const n = Math.min(5, Math.max(1, Math.round(count)));
  const mx = Math.round(w * 0.083); // ~90 px di kanvas 1080
  const top = Math.round(h * 0.052); // ~100 px di kanvas 1920
  const gap = Math.round(h * 0.017); // ~32 px
  const sw = w - mx * 2;
  const sh = Math.floor((h - top * 2 - gap * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => ({
    photoIndex: i as 0 | 1 | 2 | 3 | 4,
    x: mx,
    y: top + i * (sh + gap),
    width: sw,
    height: sh,
  }));
}

/** Shorthand slot fields so hand-written JSON can stay compact. */
interface ConfigSlot {
  photoIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  /** Rotasi foto di dalam slot (derajat). */
  rotation?: number;
  /** Zoom foto di dalam slot (1 = pas). */
  scale?: number;
}

interface BoothConfig {
  name?: unknown;
  category?: unknown;
  /** Kategori bisa lebih dari satu — frame muncul di semua kategori yang dicentang. */
  categories?: unknown;
  keywords?: unknown;
  description?: unknown;
  canvas?: unknown;
  background?: unknown;
  photoSlots?: unknown;
  decals?: unknown;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Minimal default layout for drop-in frames (stacked photos from slot folder). */
function buildDefaultTemplate(entry: BoothTemplateEntry): TemplateDef {
  const cfg = (entry.config ?? {}) as BoothConfig;

  const canvasW0 = num((cfg.canvas as { width?: unknown } | undefined)?.width) ?? 1080;
  const canvasH0 = num((cfg.canvas as { height?: unknown } | undefined)?.height) ?? 1920;

  // Slot geometry: template.json wins over the vertical-stack default
  // (jumlah default mengikuti nama folder slot, mis. templates/cute/5/frame.png).
  let photoSlots = defaultSlots(entry.slots ?? 3, canvasW0, canvasH0);
  if (Array.isArray(cfg.photoSlots) && cfg.photoSlots.length > 0) {
    const parsed = (cfg.photoSlots as ConfigSlot[])
      .map((s, i) => {
        const x = num(s.x);
        const y = num(s.y);
        const w = num(s.width);
        const h = num(s.height);
        if (x === null || y === null || w === null || h === null) return null;
        return {
          photoIndex: (num(s.photoIndex) ?? i) as 0 | 1 | 2 | 3 | 4,
          x,
          y,
          width: w,
          height: h,
          ...(s.fit === 'contain' ? { fit: 'contain' as const } : {}),
          ...(num(s.rotation) ? { rotation: num(s.rotation)! } : {}),
          ...(num(s.scale) ? { scale: num(s.scale)! } : {}),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    if (parsed.length > 0) photoSlots = parsed;
  }

  const canvasW = canvasW0;
  const canvasH = canvasH0;
  const background = typeof cfg.background === 'string' ? cfg.background : '#fffdf8';

  const cats = Array.isArray(cfg.categories)
    ? (cfg.categories as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).map((c) => c.trim())
    : [];

  // Kategori utama: template.json > folder kategori (nested). Tanpa keduanya
  // = "" (tanpa kategori) — jangan mengarang kategori dari nama frame/folder
  // datar, supaya picker tidak bikin kategori baru diam-diam.
  const primaryCat =
    typeof cfg.category === 'string' && cfg.category.trim()
      ? cfg.category.trim()
      : entry.category ?? '';

  return {
    id: `booth-${entry.id}`,
    name:
      typeof cfg.name === 'string' && cfg.name.trim()
        ? cfg.name.trim()
        : entry.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category: primaryCat,
    /** Multi-kategori dipakai picker: frame tampil di setiap kategori ini. */
    categories: cats.length > 0 ? cats : primaryCat ? [primaryCat] : [],
    thumb: entry.thumb ?? entry.frame,
    keywords: Array.isArray(cfg.keywords)
      ? (cfg.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : ['drop-in', entry.id],
    description:
      typeof cfg.description === 'string' && cfg.description.trim()
        ? cfg.description.trim()
        : 'Drop-in frame from /public/booth/templates.',
    enabled: true,
    engine: {
      canvas: { width: canvasW, height: canvasH },
      background,
      photoSlots,
      overlay: entry.frame,
      decals: [],
    },
  };
}

function applyManifest(m: BoothManifest): void {
  const dropTemplates = m.templates.map(buildDefaultTemplate);
  // Drop-in templates with id X override JSON template with the same id.
  templates = [...jsonTemplates.filter((t) => !m.templates.some((d) => d.id === t.id)), ...dropTemplates];

  const stickerIds = new Set(m.stickers.map((s) => s.id));
  stickers = [
    ...jsonStickers.filter((s) => !stickerIds.has(s.id)),
    ...m.stickers.map((s) => ({ ...s, enabled: true })),
  ];

  // Drop-in filters: overlay + optional css tone. Same-id built-in is overridden.
  const dropFilters = (m.filters ?? []).map(
    (f): FilterDef => ({
      id: f.id,
      name: f.name,
      css: f.css && f.css.trim() ? f.css.trim() : 'none',
      ...(f.overlay ? { overlay: f.overlay } : {}),
      ...(f.fit ? { fit: f.fit } : {}),
      ...(f.thumb ? { thumb: f.thumb } : {}),
    }),
  );
  const filterIds = new Set(dropFilters.map((f) => f.id));
  filters = [...jsonFilters.filter((f) => !filterIds.has(f.id)), ...dropFilters];

  globalCategories = (m.categories ?? []).map((c) => c.trim()).filter(Boolean);

  // Leaderboard frame + bentuk showcase homepage dari manifest.
  leaderboard = (m.leaderboard ?? [])
    .filter((e): e is BoothLeaderboardEntry => !!e && typeof e.id === 'string' && Number.isFinite(Number(e.count)))
    .map((e) => ({ id: e.id, count: Math.floor(Number(e.count)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  showcaseShape = isValidShowcaseShape(m.showcase?.shape ?? '')
    ? (m.showcase!.shape as string)
    : DEFAULT_SHOWCASE_SHAPE;
  showcaseFrames = (Array.isArray(m.showcase?.frames) ? m.showcase!.frames! : [])
    .filter((f): f is string => typeof f === 'string' && /^[\w-]{1,80}$/.test(f))
    .slice(0, MAX_SHOWCASE_FRAMES);
}

/**
 * Fetch the manifest once; safe to call from multiple components.
 * `force: true` membuang cache dan mengambil manifest segar — dipakai
 * halaman pilihan frame (#/frames & picker kamera) supaya frame baru hasil
 * upload admin langsung tampil tanpa reload browser.
 */
export async function ensureBoothData(options?: { force?: boolean }): Promise<void> {
  if (options?.force) {
    loaded = false;
    pending = null;
  }
  if (loaded) return;
  if (pending) return pending;
  const seq = ++fetchSeq;
  pending = (async () => {
    let m: BoothManifest | null = null;
    // 1) Endpoint server (dev middleware / npm run serve) — manifest segar,
    //    drop file baru langsung kebaca tanpa reload.
    try {
      // cache: 'no-store' — jangan biarkan HTTP menyimpan manifest lama.
      const res = await fetch('/api/booth', { cache: 'no-store' });
      if (res.ok) m = (await res.json()) as BoothManifest;
    } catch {
      /* bukan JSON / offline — lanjut ke cadangan */
    }
    // 2) Cadangan manifest statis hasil build (dist/booth-manifest.json,
    //    ditulis booth-plugin.js). Hosting statis (Vercel dsb.) tidak punya
    //    Express, jadi tanpa ini semua frame/stiker/filter drop-in hilang.
    if (!m || !Array.isArray(m.templates)) {
      try {
        const res = await fetch('/booth-manifest.json', { cache: 'no-store' });
        if (res.ok) {
          const staticManifest = (await res.json()) as BoothManifest;
          if (Array.isArray(staticManifest?.templates)) m = staticManifest;
        }
      } catch {
        /* offline/dev tanpa plugin — JSON catalog tetap dipakai */
      }
    }
    // Kalau ada permintaan lebih baru, hasil fetch ini sudah basi — buang.
    if (m && seq === fetchSeq) applyManifest(m);
    if (seq === fetchSeq) loaded = true;
  })();
  return pending;
}

/**
 * Upload / ganti PREVIEW frame (thumb.png) dari editor admin web.
 * Body = file gambar mentah; preview langsung dipakai picker frame.
 */
export async function uploadBoothThumb(id: string, file: File): Promise<void> {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Preview terlalu besar — maksimal 12 MB.');
  }
  const res = await fetch(`/api/booth/templates/${encodeURIComponent(id)}/thumb`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: file,
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
}

/** Hapus preview kustom — preview kembali memakai gambar frame aslinya. */
export async function removeBoothThumb(id: string): Promise<void> {
  const res = await fetch(`/api/booth/templates/${encodeURIComponent(id)}/thumb`, { method: 'DELETE' });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
}

/**
 * Simpan pengaturan frame (posisi slot, kategori, nama, dst.) dari editor
 * admin web → ditulis ke booth/templates/<id>/template.json di server.
 * Auth: pakai sesi admin galeri (password GALLERY_ADMIN_PASSWORD).
 */
export async function saveBoothTemplateConfig(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/booth/templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
}

/** Status editor frame admin: butuh login? password sudah disetel? */
/**
 * Status gerbang admin dari server: `reachable=false` kalau /api/booth/admin-status
 * tidak bisa dihubungi (server belum jalan / bukan alamat server) — supaya halaman
 * bisa menampilkan petunjuk yang benar, bukan fitur yang terlihat "mati".
 */
export async function fetchBoothAdminStatus(): Promise<{
  authRequired: boolean;
  authConfigured: boolean;
  reachable: boolean;
}> {
  try {
    const res = await fetch('/api/booth/admin-status');
    if (res.ok) {
      const data = (await res.json()) as { authRequired?: boolean; authConfigured?: boolean };
      return {
        authRequired: data.authRequired === true,
        authConfigured: data.authConfigured === true,
        reachable: true,
      };
    }
  } catch {
    /* di luar alamat server (atau server mati) — ditandai reachable=false */
  }
  return { authRequired: false, authConfigured: false, reachable: false };
}

/**
 * Hapus frame drop-in dari halaman developer (folder template + isinya).
 * Frame bawaan (src/data/templates.json) tidak bisa dihapus lewat sini.
 */
export async function deleteBoothTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/booth/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
}

/**
 * Simpan daftar kategori global dari halaman developer
 * (public/booth/categories.json di server).
 */
export async function saveBoothCategories(list: string[]): Promise<string[]> {
  const res = await fetch('/api/booth/categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: list }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
  const data = (await res.json()) as { categories?: string[] };
  globalCategories = (data.categories ?? list).map((c) => c.trim()).filter(Boolean);
  return globalCategories;
}

/** Batas ukuran upload gambar frame/foto di server (lihat server/index.ts). */
export const MAX_UPLOAD_MB = 48;

/**
 * Upload frame baru (developer): kirim file gambar mentah + metadata.
 * Return id template baru dari server (langsung aktif, tanpa build ulang).
 */
export async function uploadBoothFrame(
  file: File,
  meta: { name: string; category?: string; slots?: number },
): Promise<string> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(
      `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB) — maksimal ${MAX_UPLOAD_MB} MB.`,
    );
  }
  const qs = new URLSearchParams({ name: meta.name });
  if (meta.category) qs.set('category', meta.category);
  if (meta.slots) qs.set('slots', String(meta.slots));
  let res: Response;
  try {
    res = await fetch(`/api/booth/templates?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'image/png' },
      body: file,
    });
  } catch {
    throw new Error('Koneksi gagal ke server — pastikan `npm run serve` jalan dan halaman dibuka lewat alamat server.');
  }
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(await uploadRejection(res));
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Terjemahkan respons gagal upload jadi pesan yang jelas untuk admin. */
async function uploadRejection(res: Response): Promise<string> {
  const status = res.status;
  if (status === 413) return `File terlalu besar — maksimal ${MAX_UPLOAD_MB} MB per file.`;
  if (status === 415) return 'Format file tidak didukung — pakai PNG, JPG, WebP, atau SVG.';
  if (status === 429) return 'Terlalu banyak permintaan — tunggu sebentar lalu coba lagi.';
  let detail = '';
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === 'string' && data.error && data.error !== 'unauthorized') detail = ` — ${data.error}`;
  } catch {
    /* body bukan JSON */
  }
  return `Server menolak (HTTP ${status})${detail}.`;
}

/** Preload the currently selected template's frame so the camera overlay is instant. */
export async function preloadTemplateFrame(t: TemplateDef): Promise<void> {
  const overlay = t.engine.overlay;
  if (!overlay) return;
  try {
    await loadImageCached(overlay);
  } catch {
    /* overlay optional */
  }
}

export function getBoothTemplates(): TemplateDef[] {
  return templates;
}

export function getBoothStickers(): StickerDef[] {
  return stickers;
}

/** Drop-in + built-in filters, merged. Call after ensureBoothData(). */
export function getBoothFilters(): FilterDef[] {
  return filters;
}
