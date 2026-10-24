import './styles/tokens.css';
import './styles/global.css';
import './styles/capture.css';
import './styles/editor.css';
import './styles/admin.css';
// Pass gaya komik — diimpor paling akhir supaya menang atas stylesheet lain.
import './styles/comic.css';

import { initRouter, registerPage, navigate } from './app/router';
import { loadPrefs, store } from './app/state';
import { mountHomePage } from './pages/home/HomePage';
import { mountFramesPage } from './pages/frames/FramesPage';
import { mountCapturePage } from './pages/capture/CapturePage';
import { mountEditorPage } from './pages/editor/EditorPage';
import { mountDownloadPage } from './pages/download/DownloadPage';
import { mountCreditPage } from './pages/credit/CreditPage';
import { mountGuidePage } from './pages/guide/GuidePage';
import { mountGalleryPage } from './components/GalleryPage';
import { mountAdminFramesPage } from './pages/admin/AdminFramesPage';
import { mountDevLoginPage } from './pages/devlogin/DevLoginPage';
import { destroySession } from './services/session';
import { openDonationModal } from './components/DonationModal';
import { mountMusicWidget } from './components/MusicWidget';
import { toast } from './components/toast';
import { initPartyMode } from './components/party';
import { subscribeMusic, toggleMusic, type MusicStatus } from './services/music';
import { applyLayoutPref, runOnboarding } from './components/Onboarding';
import site from './data/site.json';

// Preferensi layout HP/Desktop dipasang sebelum frame pertama dirender.
applyLayoutPref();

const app = document.getElementById('app')!;

const githubLink = site.developer.links.find((l) => /github/i.test(l.label))?.url ?? '#/';

// Shell: brand · menu situs (atas) · aksi — strip langkah — routed view — footer.
app.innerHTML = `
  <header class="site-header">
    <a class="site-header__brand" href="#/" aria-label="Fotome — ke beranda">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M14.5 4h-5L8 6.5H4.5A1.5 1.5 0 0 0 3 8v10a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V8a1.5 1.5 0 0 0-1.5-1.5H16z"/><circle cx="12" cy="13" r="3.5"/></svg>
      </span>
      <span class="brand-word">fotome<em>.</em></span>
    </a>

    <nav class="site-nav" aria-label="Menu situs">
      <a class="site-nav__link" href="#/gallery">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="m4.5 17.2 4.4-4.2a2 2 0 0 1 2.8 0l3.3 3.1 2.1-1.8a2 2 0 0 1 2.6 0l.8.7"/></svg>
        Galeri
      </a>
      <a class="site-nav__link" href="#/credit">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 5 13.1a4.6 4.6 0 0 1 0-6.5 4.6 4.6 0 0 1 6.5 0l.5.5.5-.5a4.6 4.6 0 0 1 6.5 0 4.6 4.6 0 0 1 0 6.5z"/></svg>
        Kredit
      </a>
      <button type="button" class="site-nav__link" data-donate>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.6"/><path d="m4.2 8.8 3.2 3.2-3.2 3.2M19.8 8.8l-3.2 3.2 3.2 3.2"/></svg>
        Donasi
      </button>
      <a class="site-nav__link site-nav__link--gh" href="${githubLink}" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="gh-mark" d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.57.1.78-.25.78-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.3-5.26-1.28-5.26-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.48.11-3.08 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.6.23 2.79.12 3.08.74.8 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.28 5.69.42.36.78 1.07.78 2.15v3.19c0 .31.2.66.78.56A11.4 11.4 0 0 0 12 .8Z"/></svg>
        GitHub
      </a>
    </nav>

    <div class="site-header__actions">
      <button type="button" class="icon-btn icon-btn--guide" data-guide aria-label="Tutorial & langkah pakai" title="Tutorial">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>
      </button>
      <button type="button" class="icon-btn" data-music aria-pressed="false" aria-label="Putar atau jeda musik latar" title="Musik">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>
      </button>
    </div>
  </header>

  <main id="view" class="site-view"></main>

  <footer class="site-footer">
    <div class="site-footer__ticker" aria-hidden="true">
      <div class="site-footer__ticker-track">
        <span>jepret ✦ hias ✦ unduh ✦ repeat ✦ </span>
        <span>jepret ✦ hias ✦ unduh ✦ repeat ✦ </span>
        <span>jepret ✦ hias ✦ unduh ✦ repeat ✦ </span>
        <span>jepret ✦ hias ✦ unduh ✦ repeat ✦ </span>
      </div>
    </div>
    <div class="site-footer__inner">
      <div class="site-footer__brand">
        <a class="site-footer__logo" href="#/">fotome<em>.</em></a>
        <p class="site-footer__tag">Photobooth online imut: pilih frame, jepret, hias stiker, unduh. Beres dalam semenit.</p>
        <p class="site-footer__privacy">Foto diproses secara lokal di perangkatmu.</p>
      </div>
      <nav class="site-footer__links" aria-label="Tautan kaki halaman">
        <a href="#/frames">Pilih frame</a>
        <a href="#/guide">Cara pakai</a>
        <a href="#/gallery">Galeri</a>
        <a href="#/credit">Kredit</a>
        <a href="${githubLink}" target="_blank" rel="noreferrer">GitHub</a>
        <button type="button" data-donate>Donasi</button>
      </nav>
      <p class="site-footer__credit">fotome<em>.</em> — photobooth imut gratis ✦</p>
    </div>
  </footer>
`;

app.querySelectorAll('[data-donate]').forEach((el) =>
  el.addEventListener('click', openDonationModal),
);
app.querySelector('[data-guide]')?.addEventListener('click', () => navigate('/guide'));

// ---- Gerbang developer tersembunyi ----------------------------------------
// Tidak ada tombol login developer di galeri. Halaman khusus developer
// (#/admin: dashboard + editor frame) dibuka lewat gerbang tersembunyi:
// tekan logo "fotome." di header 7x berturut-turut (dalam ~1.5 dtk per
// tekanan) → halaman password khusus (#/devlogin) → password benar →
// baru menuju #/admin (dashboard + studio frame).
const brandEl = app.querySelector<HTMLElement>('.site-header__brand');
let brandTaps = 0;
let brandTapTimer = 0;
brandEl?.addEventListener('click', (e) => {
  brandTaps++;
  window.clearTimeout(brandTapTimer);
  brandTapTimer = window.setTimeout(() => {
    brandTaps = 0;
  }, 1600);
  if (brandTaps >= 7) {
    brandTaps = 0;
    // Blokir navigasi default link (ke #/) — kita yang arahkan ke #/admin.
    e.preventDefault();
    toast('Gerbang developer terbuka — masukkan password ✦', 'success');
    navigate('/devlogin');
  }
});

// ---- Header music button mirrors the floating widget ---------------------
const musicBtn = app.querySelector<HTMLButtonElement>('[data-music]');
musicBtn?.addEventListener('click', toggleMusic);
subscribeMusic((s: MusicStatus) => {
  if (!musicBtn) return;
  musicBtn.hidden = !s.available;
  musicBtn.setAttribute('aria-pressed', String(s.playing));
  musicBtn.title = s.playing ? 'Jeda musik' : 'Putar musik';
});

// Halaman kerja (capture/edit) tampil full-viewport: halaman tidak scroll,
// hanya panel fitur di dalamnya. Halaman lain normal.
const FULLVIEW_PAGES = new Set<string>(['capture', 'editor']);
store.subscribe('page', (p) => {
  document.body.classList.toggle('is-fullview', FULLVIEW_PAGES.has(p));
});

loadPrefs();
registerPage('/', 'home', mountHomePage);
registerPage('/frames', 'frames', mountFramesPage);
registerPage('/capture', 'capture', mountCapturePage);
registerPage('/edit', 'editor', mountEditorPage);
registerPage('/download', 'download', mountDownloadPage);
registerPage('/credit', 'credit', mountCreditPage);
registerPage('/gallery', 'gallery', mountGalleryPage);
registerPage('/guide', 'guide', mountGuidePage);
// Studio settingan frame khusus admin (posisi slot drag & resize di web).
registerPage('/admin', 'admin', mountAdminFramesPage);
// Gerbang developer: halaman password sebelum masuk #/admin.
registerPage('/devlogin', 'devlogin', mountDevLoginPage);

// Leaving the site entirely should not leave a phantom session behind.
window.addEventListener('pagehide', () => destroySession());

initRouter(document.getElementById('view')!);

// Background music (drop-in folder public/music/) + floating player widget.
mountMusicWidget();

// Easter egg: tekan f 3x untuk mode pesta.
initPartyMode();

// App siap ditampilkan: buang loading screen setelah frame pertama ter-render.
requestAnimationFrame(() => {
  document.getElementById('boot')?.remove();
  document.getElementById('app')!.hidden = false;
  document.body.classList.add('is-booted');
  // Onboarding sekali per browser: pilih HP/Desktop, lalu pilihan baca guide.
  // Halaman developer (#/admin, #/devlogin) dilewati — modal layout/guide
  // memblokir dashboard studio frame saat dibuka langsung lewat alamat server.
  const bootPath = location.hash.replace(/^#/, '') || '/';
  if (bootPath !== '/admin' && bootPath !== '/devlogin') runOnboarding();
});
