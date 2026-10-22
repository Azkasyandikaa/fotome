import type { Session } from '../types';

export type PageId =
  | 'home'
  | 'frames'
  | 'capture'
  | 'editor'
  | 'download'
  | 'credit'
  | 'gallery'
  | 'guide'
  | 'admin'
  | 'devlogin';

interface AppState {
  page: PageId;
  session: Session | null;
  selectedTemplateId: string;
  selectedFilterId: string;
  mirrorEnabled: boolean;
  dockCollapsed: boolean;
  /** How many shots the capture flow takes (spec §5.1 "Jumlah foto"). */
  photoCount: number;
}

type Listener<T> = (value: T) => void;

const state: AppState = {
  page: 'home',
  session: null,
  selectedTemplateId: '',
  selectedFilterId: 'normal',
  mirrorEnabled: true,
  dockCollapsed: false,
  photoCount: 3,
};

const listeners = new Map<string, Set<Listener<unknown>>>();

function notify(key: keyof AppState): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) fn(state[key]);
}

export const store = {
  get: <K extends keyof AppState>(key: K): AppState[K] => state[key],

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    state[key] = value;
    notify(key);
  },

  subscribe<K extends keyof AppState>(key: K, fn: Listener<AppState[K]>): () => void {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    // Cast is safe: key ties the listener type to the state field.
    set.add(fn as Listener<unknown>);
    return () => {
      set?.delete(fn as Listener<unknown>);
    };
  },

  /** Drop all photo data so blobs/bitmaps can be garbage collected. */
  clearSession(): void {
    state.session = null;
    notify('session');
  },
};

const TEMPLATE_KEY = 'photobooth.template';
const FILTER_KEY = 'photobooth.filter';
const MIRROR_KEY = 'photobooth.mirror';
const DOCK_KEY = 'photobooth.dock';
const COUNT_KEY = 'photobooth.photoCount';

/** Jumlah foto: mengikuti slot frame, dibatasi 1–5 (frame bisa 1–5 slot). */
export function normalizePhotoCount(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

/** Persist lightweight prefs (ids only — never photos). */
export function loadPrefs(): void {
  try {
    const t = localStorage.getItem(TEMPLATE_KEY);
    if (t) state.selectedTemplateId = t;
    const f = localStorage.getItem(FILTER_KEY);
    if (f) state.selectedFilterId = f;
    const m = localStorage.getItem(MIRROR_KEY);
    if (m !== null) state.mirrorEnabled = m === '1';
    state.dockCollapsed = localStorage.getItem(DOCK_KEY) === '1';
    const c = localStorage.getItem(COUNT_KEY);
    if (c !== null) state.photoCount = normalizePhotoCount(Number(c));
  } catch {
    /* storage may be unavailable (private mode) — defaults are fine */
  }
}

export function saveTemplatePref(id: string): void {
  state.selectedTemplateId = id;
  try {
    localStorage.setItem(TEMPLATE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function saveFilterPref(id: string): void {
  state.selectedFilterId = id;
  try {
    localStorage.setItem(FILTER_KEY, id);
  } catch {
    /* ignore */
  }
}

export function saveMirrorPref(on: boolean): void {
  state.mirrorEnabled = on;
  try {
    localStorage.setItem(MIRROR_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function saveDockPref(collapsed: boolean): void {
  state.dockCollapsed = collapsed;
  try {
    localStorage.setItem(DOCK_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function savePhotoCountPref(count: number): void {
  state.photoCount = normalizePhotoCount(count);
  try {
    localStorage.setItem(COUNT_KEY, String(state.photoCount));
  } catch {
    /* ignore */
  }
}
