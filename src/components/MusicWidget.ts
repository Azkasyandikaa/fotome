/**
 * Floating background-music widget (bottom-right).
 * Appears only when public/music/ has tracks. Toggle + skip, spin when playing.
 */
import { initMusic, skipMusic, subscribeMusic, toggleMusic, type MusicStatus } from '../services/music';

let mounted = false;

function render(w: HTMLElement, s: MusicStatus): void {
  const btn = w.querySelector<HTMLButtonElement>('.music-widget__btn');
  const label = w.querySelector<HTMLElement>('.music-widget__label');
  if (!btn || !label) return;

  btn.classList.toggle('is-playing', s.playing);
  btn.setAttribute('aria-pressed', s.playing ? 'true' : 'false');
  btn.title = s.playing ? `Musik: ${s.title} — klik untuk jeda` : 'Putar musik';
  label.textContent = s.playing ? s.title : 'Musik';

  const next = w.querySelector<HTMLButtonElement>('.music-widget__next');
  if (next) next.style.display = s.total > 1 ? '' : 'none';
}

export function mountMusicWidget(): void {
  if (mounted) return;
  mounted = true;

  const w = document.createElement('div');
  w.className = 'music-widget';
  w.innerHTML = `
    <span class="music-widget__label" aria-hidden="true"></span>
    <button type="button" class="music-widget__btn" aria-pressed="false" aria-label="Putar atau jeda musik latar">
      <span class="music-widget__disc" aria-hidden="true">
        <i></i><i></i><i></i>
      </span>
    </button>
    <button type="button" class="music-widget__next music-widget__next--btn" aria-label="Lagu berikutnya" title="Lagu berikutnya">⏭</button>
  `;

  w.querySelector('.music-widget__btn')!.addEventListener('click', toggleMusic);
  w.querySelector('.music-widget__next')!.addEventListener('click', skipMusic);

  document.body.appendChild(w);

  subscribeMusic((s) => {
    if (!s.available) {
      w.hidden = true; // no tracks in public/music/ -> stay hidden
      return;
    }
    w.hidden = false;
    render(w, s);
  });

  void initMusic();
}
