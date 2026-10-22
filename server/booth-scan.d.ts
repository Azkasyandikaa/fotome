export interface BoothTemplateEntry {
  id: string;
  frame: string;
  thumb: string | null;
  /** Kategori utama dari nama folder (null kalau flat & tak ada di template.json). */
  category: string | null;
  /** Semua kategori frame (config.categories; fallback category tunggal). */
  categories: string[];
  /** Jumlah slot dari nama folder "1".."5" (null kalau tidak pakai folder slot). */
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

export interface BoothManifest {
  templates: BoothTemplateEntry[];
  stickers: BoothStickerEntry[];
  filters: BoothFilterEntry[];
}

export function scanBooth(publicDir: string): BoothManifest;
export function findTemplateDir(publicDir: string, id: string): string | null;
export function saveBoothTemplate(
  publicDir: string,
  id: string,
  patch: Record<string, unknown>,
): string | null;

export function slugifyId(name: unknown): string;

export function createBoothTemplate(
  publicDir: string,
  opts: {
    name: string;
    category?: string;
    slots?: number;
    ext: string;
    buffer: Buffer;
    /** Paksa id folder (tanpa suffix) — dipakai server production supaya dist & public selalu sama. */
    id?: string;
  },
): { id: string; dir: string } | null;
export function deleteBoothTemplate(publicDir: string, id: string): boolean;
export function loadBoothCategories(publicDir: string): string[];
export function saveBoothCategories(publicDir: string, categories: string[]): string[];

/** Leaderboard pemakaian frame (public/booth/leaderboard.json). */
export function loadBoothLeaderboard(publicDir: string): Record<string, number>;
export function bumpBoothUsage(publicDir: string, id: string): number | null;
export function boothLeaderboardEntries(
  publicDir: string,
): { id: string; count: number }[];

/** Konfigurasi showcase homepage (public/booth/showcase.json). */
export const SHOWCASE_SHAPES: string[];
export const DEFAULT_SHOWCASE_SHAPE: string;
/** Maksimal frame terpilih yang tampil di homepage. */
export const MAX_SHOWCASE_FRAMES: number;
export interface BoothShowcase {
  shape: string;
  /** Id frame terpilih (maks. MAX_SHOWCASE_FRAMES, urut tampil). */
  frames: string[];
}
export function loadBoothShowcase(publicDir: string): BoothShowcase;
/**
 * Simpan konfigurasi showcase. `patch` berupa { shape?, frames? } — field yang
 * tidak dikirim dipertahankan. String lama (shape saja) masih diterima.
 */
export function saveBoothShowcase(
  publicDir: string,
  patch: string | { shape?: string; frames?: string[] },
): BoothShowcase;
