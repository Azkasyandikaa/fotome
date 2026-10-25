/**
 * Floating background-music widget (bottom-right).
 *
 * Dua keadaan:
 *  - KOLAP: satu piringan hitam (vinyl) yang berputar saat musik jalan —
 *    bentuk default, ringan, tidak menutupi konten.
 *  - BUKA:  piringan "mekar" jadi kartu player ala Spotify — sampul disc,
 *    judul lagu, progress bar (klik utk seek), tombol prev / play-pause / next,
 *    plus tombol tutup.
 *
 * Muncul hanya kalau public/music/ punya lagu (lihat services/music.ts).
 */
import {
  initMusic,
  prevMusic,
  seekMusic,
  skipMusic,
  subscribeMusic,
  toggleMusic,
  type MusicStatus,
} from '../services/music';

let mounted = false;

/** 0:00 — format detik → menit:detik untuk label waktu player. */
function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function render(w: HTMLElement, s: MusicStatus): void {
  // PENTING: selector spesifik "button.…" — span art di dalam kartu juga memakai
  // class music-widget__disc dan urut LEBIH AWAL di DOM, jadi query polos
  // akan menangkap span art, bukan tombolnya.
  const discBtn = w.querySelector<HTMLButtonElement>('button.music-widget__disc');
  const playBtn = w.querySelector<HTMLButtonElement>('.music-widget__play');
  const title = w.querySelector<HTMLElement>('.music-widget__title');
  const sub = w.querySelector<HTMLElement>('.music-widget__sub');
  const fill = w.querySelector<HTMLElement>('.music-widget__bar-fill');
  const tNow = w.querySelector<HTMLElement>('.music-widget__t-now');
  const tDur = w.querySelector<HTMLElement>('.music-widget__t-dur');

  w.classList.toggle('is-playing', s.playing);
  w.classList.toggle('is-open', w.dataset.open === '1');

  // Disc = tombol buka/tutup (label diatur setOpen), bukan play/pause.
  // Tombol play di kartu yang menampilkan status putar/jeda.
  const playLabel = s.playing ? 'Jeda musik' : 'Putar musik';
  if (discBtn) discBtn.setAttribute('aria-expanded', w.dataset.open === '1' ? 'true' : 'false');
  if (playBtn) {
    playBtn.textContent = s.playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', playLabel);
    playBtn.title = playLabel;
  }

  if (title) title.textContent = s.title || 'Musik latar';
  if (sub) sub.textContent = s.total > 1 ? `Lagu ${s.index + 1} dari ${s.total}` : 'Sedang diputar';

  const pct = s.duration > 0 ? Math.min(100, (s.time / s.duration) * 100) : 0;
  if (fill) fill.style.width = `${pct.toFixed(2)}%`;
  if (tNow) tNow.textContent = fmt(s.time);
  if (tDur) tDur.textContent = fmt(s.duration);

  const bar = w.querySelector<HTMLElement>('.music-widget__bar');
  if (bar) {
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    bar.setAttribute('aria-valuetext', `${fmt(s.time)} dari ${fmt(s.duration)}`);
  }

  // Tombol prev/next hanya berguna kalau ada lebih dari satu lagu.
  const multi = s.total > 1;
  w.querySelectorAll<HTMLButtonElement>('.music-widget__prev, .music-widget__next').forEach((b) => {
    b.hidden = !multi;
  });
}

export function mountMusicWidget(): void {
  if (mounted) return;
  mounted = true;

  const w = document.createElement('div');
  w.className = 'music-widget';
  w.dataset.open = '0';
  w.innerHTML = `
    <div class="music-widget__card" role="group" aria-label="Player musik">
      <div class="music-widget__head">
        <span class="music-widget__art" aria-hidden="true">
          <span class="music-widget__disc music-widget__disc--art"><i></i><i></i><i></i></span>
        </span>
        <span class="music-widget__meta">
          <strong class="music-widget__title">Musik latar</strong>
          <small class="music-widget__sub">Sedang diputar</small>
        </span>
        <button type="button" class="music-widget__close" aria-label="Tutup player musik" title="Tutup">✕</button>
      </div>

      <div class="music-widget__progress">
        <span class="music-widget__t-now">0:00</span>
        <div class="music-widget__bar" role="slider" tabindex="0"
             aria-label="Posisi lagu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="music-widget__bar-fill"></span>
          <span class="music-widget__knob" aria-hidden="true"></span>
        </div>
        <span class="music-widget__t-dur">0:00</span>
      </div>

      <div class="music-widget__controls">
        <button type="button" class="music-widget__prev" aria-label="Lagu sebelumnya" title="Sebelumnya">⏮</button>
        <button type="button" class="music-widget__play" aria-label="Putar musik" aria-pressed="false">▶</button>
        <button type="button" class="music-widget__next" aria-label="Lagu berikutnya" title="Berikutnya">⏭</button>
      </div>
    </div>

    <button type="button" class="music-widget__disc" aria-expanded="false"
            aria-label="Buka player musik" title="Buka player musik">
      <span class="music-widget__disc-face" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="music-widget__disc-note" aria-hidden="true">♪</span>
    </button>
  `;

  const setOpen = (open: boolean): void => {
    w.dataset.open = open ? '1' : '0';
    w.classList.toggle('is-open', open);
    const disc = w.querySelector<HTMLButtonElement>('button.music-widget__disc');
    if (disc) {
      const label = open ? 'Tutup player musik' : 'Buka player musik';
      disc.setAttribute('aria-label', label);
      disc.setAttribute('aria-expanded', open ? 'true' : 'false');
      disc.title = label;
    }
  };

  // Disc = toggle BUKA/TUTUP kartu (bukan play/pause — sesuai permintaan:
  // bentuk awal bulat muter, dipencet baru keluar card kontrolnya).
  w.querySelector('button.music-widget__disc')?.addEventListener('click', () => setOpen(w.dataset.open !== '1'));
  w.querySelector('.music-widget__close')?.addEventListener('click', () => setOpen(false));

  w.querySelector('.music-widget__play')?.addEventListener('click', toggleMusic);
  w.querySelector('.music-widget__prev')?.addEventListener('click', prevMusic);
  w.querySelector('.music-widget__next')?.addEventListener('click', skipMusic);

  // Progress bar: klik / seret utk seek + panah keyboard utk geser 5 detik.
  const bar = w.querySelector<HTMLElement>('.music-widget__bar');
  let dragging = false;
  // Ratio → detik butuh durasi; ikuti dari status terakhir lewat cache sederhana.
  let lastDuration = 0;
  bar?.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.setPointerCapture?.(e.pointerId);
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (lastDuration > 0) seekMusic(ratio * lastDuration);
  });
  bar?.addEventListener('pointermove', (e) => {
    if (!dragging || lastDuration <= 0) return;
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    seekMusic(ratio * lastDuration);
  });
  const stopDrag = (): void => {
    dragging = false;
  };
  bar?.addEventListener('pointerup', stopDrag);
  bar?.addEventListener('pointercancel', stopDrag);
  bar?.addEventListener('keydown', (e) => {
    if (lastDuration <= 0) return;
    const step = 5;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekMusic(Math.min(lastDuration, lastDuration * (Number(bar.getAttribute('aria-valuenow')) / 100) + step));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekMusic(Math.max(0, lastDuration * (Number(bar.getAttribute('aria-valuenow')) / 100) - step));
    }
  });

  // Klik di luar kartu saat terbuka → tutup (Escape juga menutup).
  document.addEventListener('pointerdown', (e) => {
    if (w.dataset.open !== '1') return;
    if (w.contains(e.target as Node)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && w.dataset.open === '1') setOpen(false);
  });

  document.body.appendChild(w);

  subscribeMusic((s) => {
    if (!s.available) {
      w.hidden = true; // no tracks in public/music/ -> stay hidden
      return;
    }
    w.hidden = false;
    lastDuration = s.duration;
    render(w, s);
  });

  void initMusic();
}