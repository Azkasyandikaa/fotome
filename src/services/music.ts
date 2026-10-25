/**
 * Background music service.
 *
 * Tracks come from the drop-in folder public/music/ (manifest via /api/music —
 * see server/music-scan.js). First track plays as soon as the browser allows;
 * if autoplay is blocked, playback starts on the first user gesture anywhere.
 */

export interface Track {
  src: string;
  file: string;
  title: string;
}

export interface MusicStatus {
  available: boolean;
  playing: boolean;
  index: number;
  total: number;
  title: string;
  /** Posisi pemutaran (detik) — untuk progress bar player. */
  time: number;
  /** Durasi lagu berjalan (detik), 0 kalau belum diketahui. */
  duration: number;
}

type StatusListener = (s: MusicStatus) => void;

interface MusicManifest {
  autoplay: boolean;
  tracks: Track[];
}

const STATUS_KEY = 'photobooth.musicOn';

let audio: HTMLAudioElement | null = null;
let tracks: Track[] = [];
let index = 0;
let wantPlay = false; // user intent — survives track changes and unlock
let available = false;
let inited = false;
let unlocked = false;

const listeners = new Set<StatusListener>();

function status(): MusicStatus {
  return {
    available,
    playing: !!audio && wantPlay && !audio.paused,
    index,
    total: tracks.length,
    title: tracks[index]?.title ?? '',
    time: audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
  };
}

function emit(): void {
  const s = status();
  for (const fn of listeners) fn(s);
}

function nextIndex(): number {
  return tracks.length ? (index + 1) % tracks.length : 0;
}

function prevIndex(): number {
  return tracks.length ? (index - 1 + tracks.length) % tracks.length : 0;
}

function playCurrent(): void {
  if (!audio || !tracks.length) return;
  // play() can reject until a gesture unlocks audio — intent is kept, the
  // unlock listener retries.
  void audio.play().then(
    () => emit(),
    () => emit(),
  );
}

function loadTrack(i: number, autoplay: boolean): void {
  if (!audio || !tracks.length) return;
  // Index DULU, baru ambil lagunya — kalau tidak, src yang terpasang adalah
  // lagu LAMA (index sebelum digeser) dan tombol skip terasa tidak bekerja.
  index = ((i % tracks.length) + tracks.length) % tracks.length;
  const t = tracks[index];
  if (!t) return;
  audio.src = t.src;
  audio.load();
  if (autoplay) playCurrent();
  else emit();
}

function onEnded(): void {
  loadTrack(nextIndex(), true);
}

/** One-time audio unlock for autoplay-blocked browsers. */
function unlock(): void {
  if (unlocked || !wantPlay) return;
  unlocked = true;
  playCurrent();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}

function persist(on: boolean): void {
  try {
    localStorage.setItem(STATUS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function wasOn(): boolean {
  try {
    return localStorage.getItem(STATUS_KEY) !== '0';
  } catch {
    return true;
  }
}

async function fetchManifest(): Promise<MusicManifest | null> {
  // Utama: endpoint server Express (dev middleware / npm run serve).
  // Cadangan: manifest statis yang ditulis vite saat build
  // (booth-plugin.js → dist/music-manifest.json) — dipakai di hosting statis
  // seperti Vercel di mana /api/music tidak ada (404 / kembali HTML index).
  for (const url of ['/api/music', '/music-manifest.json']) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) continue;
      const data = (await res.json()) as MusicManifest;
      if (Array.isArray(data?.tracks)) return data;
    } catch {
      /* bukan JSON (mis. rewrite SPA balikin index.html) → coba URL berikutnya */
    }
  }
  return null;
}

/** Fetch the manifest and start playing if allowed. Safe to call once. */
export async function initMusic(): Promise<void> {
  if (inited) return;
  inited = true;

  const manifest = await fetchManifest();
  tracks = manifest?.tracks ?? [];
  available = tracks.length > 0;
  if (!available) {
    emit();
    return;
  }

  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 0.55;
  audio.loop = false; // playlist-level loop via 'ended'
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  // Progress bar: timeupdate ~4x/detik — cukup halus untuk UI, murah untuk DOM.
  audio.addEventListener('timeupdate', emit);
  // Durasi baru diketahui setelah metadata lagu termuat.
  audio.addEventListener('loadedmetadata', emit);

  // Restart from the first track — kept simple and predictable.
  loadTrack(0, false);

  if (manifest?.autoplay !== false && wasOn()) {
    wantPlay = true;
    playCurrent(); // may reject before any gesture — unlock below retries
    if (audio.paused) {
      window.addEventListener('pointerdown', unlock, { once: false });
      window.addEventListener('keydown', unlock, { once: false });
    }
  }
  emit();
}

export function toggleMusic(): void {
  if (!audio || !tracks.length) return;
  if (audio.paused) {
    wantPlay = true;
    unlocked = true; // toggle is itself a gesture
    persist(true);
    playCurrent();
  } else {
    wantPlay = false;
    persist(false);
    audio.pause();
  }
}

export function skipMusic(): void {
  if (!audio || !tracks.length) return;
  wantPlay = true;
  unlocked = true;
  persist(true);
  loadTrack(nextIndex(), true);
}

/**
 * Mundur satu lagu. Kalau lagu sudah jalan > 3 detik, perlakukan sebagai
 * "ulang dari awal" — perilaku standar tombol prev di player musik.
 */
export function prevMusic(): void {
  if (!audio || !tracks.length) return;
  wantPlay = true;
  unlocked = true;
  persist(true);
  if (audio.currentTime > 3 || index === 0) {
    audio.currentTime = 0;
    playCurrent();
    return;
  }
  loadTrack(prevIndex(), true);
}

/** Seek ke posisi tertentu (detik) — dipakai progress bar player. */
export function seekMusic(seconds: number): void {
  if (!audio || !tracks.length) return;
  const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (dur <= 0) return;
  audio.currentTime = Math.min(Math.max(0, seconds), dur);
  emit();
}

export function musicTitle(): string {
  return tracks[index]?.title ?? '';
}

export function subscribeMusic(fn: StatusListener): () => void {
  listeners.add(fn);
  fn(status());
  return () => {
    listeners.delete(fn);
  };
}
