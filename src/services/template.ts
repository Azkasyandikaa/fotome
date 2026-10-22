import type { FilterDef, StickerDef, TemplateDef } from '../types';
import templateData from '../data/templates.json';
import stickerData from '../data/stickers.json';
import filterData from '../data/filters.json';
import { ensureBoothData, getBoothTemplates, getBoothStickers, getBoothFilters, getBoothGlobalCategories } from './booth';
import { savePhotoCountPref, store } from '../app/state';

const jsonTemplates = templateData as TemplateDef[];
const jsonStickers = stickerData as StickerDef[];
export const jsonFilters = filterData as FilterDef[];

/**
 * Catalog state: starts with the JSON entries, then merges the drop-in
 * booth folders (/public/booth/**) once the manifest arrives.
 */
let templates: TemplateDef[] = jsonTemplates;
let stickers: StickerDef[] = jsonStickers;
let filters: FilterDef[] = jsonFilters;
/** Kategori global (dibuat di halaman developer) — selalu tampil di picker. */
let globalCats: string[] = [];

/**
 * Await at page mount so drop-in frames/stickers/filters are included.
 * `force: true` = ambil manifest segar dari server (halaman pilihan frame)
 * supaya frame yang baru di-upload admin langsung muncul di daftar.
 */
export async function initCatalog(options?: { force?: boolean }): Promise<void> {
  await ensureBoothData(options);
  templates = getBoothTemplates();
  stickers = getBoothStickers();
  filters = getBoothFilters();
  globalCats = getBoothGlobalCategories();
}

export function getEnabledTemplates(): TemplateDef[] {
  return templates.filter((t) => t.enabled);
}

export function getTemplate(id: string): TemplateDef | undefined {
  return templates.find((t) => t.id === id);
}

/**
 * Jumlah jepretan SELALU mengikuti frame: frame 1 slot = 1 jepretan,
 * frame 2 slot = 2 jepretan, dst. Dipanggil setiap kali frame dipilih.
 */
export function syncShotCountToTemplate(template: TemplateDef | null | undefined): number {
  const slots = template?.engine.photoSlots.length ?? 0;
  if (slots > 0) savePhotoCountPref(slots);
  return store.get('photoCount');
}

export function getSticker(id: string): StickerDef | undefined {
  return stickers.find((s) => s.id === id);
}

export function getAllStickers(): StickerDef[] {
  return stickers.filter((s) => s.enabled);
}

/** All filters (built-in + drop-in). Drop-ins override same-id built-ins. */
export function getFilters(): FilterDef[] {
  return filters;
}

export function getFilter(id: string): FilterDef {
  return filters.find((f) => f.id === id) ?? filters[0]!;
}

/** Kategori global dari halaman developer (untuk editor frame juga). */
export function getGlobalCategories(): string[] {
  return globalCats;
}

/**
 * Kategori picker: HANYA daftar "Kelola kategori" developer
 * (public/booth/categories.json) yang bisa jadi chip kategori — kategori tidak
 * pernah bertambah sendiri dari nama frame / nama folder. Frame yang tidak
 * masuk daftar mana pun tampil di chip pseudo "Lainnya".
 */
export const OTHER_CATEGORY = 'lainnya';

function managedCategorySet(): Set<string> {
  return new Set(globalCats.map((c) => c.trim().toLowerCase()).filter(Boolean));
}

/** Apakah frame masuk kategori terpilih (case-insensitive; 'lainnya' = di luar daftar). */
export function templateInCategory(t: TemplateDef, category: string): boolean {
  if (category === 'all') return true;
  const key = category.trim().toLowerCase();
  const managed = managedCategorySet();
  const cats = t.categories.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (key === OTHER_CATEGORY) return !cats.some((c) => managed.has(c));
  return cats.includes(key);
}

export function getCategories(): string[] {
  const managed = [...new Set(globalCats.map((c) => c.trim()).filter(Boolean))].sort();
  const mset = new Set(managed.map((c) => c.toLowerCase()));
  // Chip "Lainnya" hanya tampil kalau ada frame di luar daftar kategori.
  const hasOther = getEnabledTemplates().some((t) =>
    t.categories.map((c) => c.trim().toLowerCase()).filter(Boolean).every((c) => !mset.has(c)),
  );
  const showOther = hasOther && !mset.has(OTHER_CATEGORY);
  return ['all', ...managed, ...(showOther ? [OTHER_CATEGORY] : [])];
}

export function formatCategory(raw: string): string {
  if (raw === 'all') return 'All';
  if (raw === OTHER_CATEGORY) return 'Lainnya';
  const t = raw.trim();
  if (!t) return 'Lainnya';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Realtime search across name, category and keywords. */
export function searchTemplates(query: string, category: string): TemplateDef[] {
  const q = query.trim().toLowerCase();
  return getEnabledTemplates().filter((t) => {
    if (!templateInCategory(t, category)) return false;
    if (!q) return true;
    const haystack = [t.name, t.category, ...t.categories, ...t.keywords].join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  });
}
