import site from '../../data/site.json';
import { navigate } from '../../app/router';
import { saveTemplatePref } from '../../app/state';
import { fetchFeaturedPhotos, photoImageUrl, type PublicPhoto } from '../../services/cloudGallery';
import { getEnabledTemplates, getTemplate, initCatalog } from '../../services/template';
import {
  getBoothLeaderboard,
  getBoothShowcaseFrames,
  getBoothShowcaseShape,
  isValidShowcaseShape,
  type BoothLeaderboardEntry,
} from '../../services/booth';
import { toast } from '../../components/toast';
import type { TemplateDef } from '../../types';

/**
 * Home — landing page ringkas. Fitur yang dulu numpuk jadi "Langkah 1/2/3"
 * sekarang punya halaman sendiri:
 *   #/frames  pilih frame + settingan frame   (dulu Langkah 1)
 *   #/capture jepret: timer, filter, mirror    (dulu Langkah 2 & 3)
 *   #/edit    hias: stiker, layer, ukuran foto (butuh sesi foto)
 *   #/guide   cara pakai / tutorial
 */
interface FeatureCard {
  icon: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  accent: 'pink' | 'violet' | 'mint' | 'lemon';
}

const ICON_FRAME =
  '<svg viewBox="0 0 24 24"><path d="M7.5 3.2v13.3a2.5 2.5 0 0 0 2.5 2.5h10.8"/><path d="M3.2 7.5h13.3a2.5 2.5 0 0 1 2.5 2.5v10.8"/><circle cx="17.6" cy="6.4" r="1.7"/></svg>';
const ICON_SHOT =
  '<svg viewBox="0 0 24 24"><path d="M4 8.6A2.6 2.6 0 0 1 6.6 6h1.2L9 3.6h6L16.2 6h1.2A2.6 2.6 0 0 1 20 8.6v7.8A2.6 2.6 0 0 1 17.4 19H6.6A2.6 2.6 0 0 1 4 16.4z"/><circle cx="12" cy="12.4" r="3.3"/></svg>';
const ICON_DECORATE =
  '<svg viewBox="0 0 24 24"><path d="M11 3.6 12.9 9l5.4 1.9-5.4 1.9L11 18.2 9.1 12.8 3.7 10.9 9.1 9z"/><path d="M18.4 15.4l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z"/></svg>';
const ICON_GALLERY =
  '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="m4.5 17.2 4.4-4.2a2 2 0 0 1 2.8 0l3.3 3.1 2.1-1.8a2 2 0 0 1 2.6 0l.8.7"/></svg>';

const FEATURES: FeatureCard[] = [
  {
    icon: ICON_FRAME,
    title: 'Pilih frame',
    text: 'Ratusan bingkai 1–5 slot, lengkap dengan kategori & settingan otomatisnya.',
    cta: 'Buka pilihan frame',
    href: '/frames',
    accent: 'pink',
  },
  {
    icon: ICON_SHOT,
    title: 'Jepret',
    text: 'Timer 3/5/10 detik, filter warna live, dan mode cermin ala selfie.',
    cta: 'Nyalakan kamera',
    href: '/capture',
    accent: 'violet',
  },
  {
    icon: ICON_DECORATE,
    title: 'Hias foto',
    text: 'Stiker, teks, coretan — atur layer di depan/belakang frame, ukuran foto bebas.',
    cta: 'Lihat cara makainya',
    href: '/guide',
    accent: 'mint',
  },
  {
    icon: ICON_GALLERY,
    title: 'Galeri fotome',
    text: 'Intip hasil fotostrip orang lain, atau pamerkan hasil jepretanmu.',
    cta: 'Buka galeri',
    href: '/gallery',
    accent: 'lemon',
  },
];

export function mountHomePage(host: HTMLElement): () => void {
  let stickyObserver: IntersectionObserver | undefined;
  let destroyed = false;

  host.innerHTML = `
    <div class="home home--landing container">
      <section class="home__hero" aria-labelledby="home-title">
        <div class="home__intro">
          <p class="label home__kicker">PHOTOBOOTH ONLINE</p>
          <span class="home__stamp" aria-hidden="true">gratis<br />terus!</span>
          <h1 class="home__title" id="home-title">fo<em>to</em>me</h1>
          <p class="home__tagline">${site.tagline}</p>
          <p class="home__desc"></p>
          <div class="home__actions">
            <button type="button" class="btn btn--primary btn--lg" data-start>Mulai Fotobooth ✦</button>
            <button type="button" class="btn btn--ghost" data-frames>🖼️ Pilih frame</button>
            <button type="button" class="btn btn--ghost" data-guide>📖 Cara pakai</button>
          </div>
        </div>

        <figure class="home__showcase" data-showcase aria-label="Hasil fotostrip pilihan">
          <figcaption data-showcase-cap class="home__showcase-cap">
            <a href="#/frames">🖼️ Frame favorite developer — klik untuk melihat ✦</a>
          </figcaption>
          <span class="home__showcase-tape" aria-hidden="true"></span>
          <div class="home__showcase-clip">
            <div class="home__showcase-body" data-showcase-body>
              <span class="home__showcase-skel"></span>
              <span class="home__showcase-skel"></span>
              <span class="home__showcase-skel"></span>
            </div>
          </div>
          <span class="home__showcase-deco home__showcase-deco--a" aria-hidden="true">♡</span>
          <span class="home__showcase-deco home__showcase-deco--b" aria-hidden="true">✦</span>
        </figure>
      </section>

      <div class="section-head">
        <p class="label section-head__kicker">✦ mulai dari mana?</p>
        <h2 class="section-head__title">Empat pintu, semua gratis</h2>
        <p class="section-head__sub">Nggak perlu daftar, nggak perlu akun — langsung jepret dari browser.</p>
      </div>

      <section class="feature-grid" aria-label="Fitur fotome">
        ${FEATURES.map(
          (f, i) => `
          <button type="button" class="feature-card feature-card--${f.accent}" data-goto="${f.href}" data-step="0${i + 1}">
            <span class="feature-card__icon" aria-hidden="true">${f.icon}</span>
            <span class="feature-card__title">${f.title}</span>
            <span class="feature-card__text">${f.text}</span>
            <span class="feature-card__cta">${f.cta} →</span>
          </button>`,
        ).join('')}
      </section>

      <section class="home__popular" data-popular hidden aria-label="Leaderboard frame terpopuler">
        <header class="home__popular-head">
          <p class="label home__popular-kicker">🏆 Leaderboard frame</p>
          <h2 class="home__popular-title">Paling <em>sering dipakai</em></h2>
          <p class="home__popular-sub">
            Terupdate otomatis dari jepretan pengunjung — 5 teratas juga tampil di beranda.
          </p>
        </header>
        <ol class="home__popular-list" data-popular-list></ol>
      </section>

      <div class="section-head">
        <p class="label section-head__kicker">✦ alurnya cuma 3 langkah</p>
        <h2 class="section-head__title">Pilih · Jepret · Unduh</h2>
      </div>

      <section class="home__flow" aria-label="Alur memakai fotome">
        <ol class="guide-flow">
          <li class="guide-flow__node">
            <span class="guide-flow__dot">1</span>
            <span class="guide-flow__label">Pilih frame</span>
          </li>
          <li class="guide-flow__arrow" aria-hidden="true">➜</li>
          <li class="guide-flow__node">
            <span class="guide-flow__dot">2</span>
            <span class="guide-flow__label">Jepret</span>
          </li>
          <li class="guide-flow__arrow" aria-hidden="true">➜</li>
          <li class="guide-flow__node">
            <span class="guide-flow__dot">3</span>
            <span class="guide-flow__label">Hias</span>
          </li>
          <li class="guide-flow__arrow" aria-hidden="true">➜</li>
          <li class="guide-flow__node">
            <span class="guide-flow__dot">4</span>
            <span class="guide-flow__label">Unduh</span>
          </li>
        </ol>
      </section>

      <section class="home__notes" aria-label="Kenapa fotome">
        <span class="note-pill">🔒 Foto diproses di browser kamu</span>
        <span class="note-pill">🍬 Semua frame & filter gratis</span>
        <span class="note-pill">⏱️ Timer jepret 3 / 5 / 10 detik</span>
        <span class="note-pill">🗂️ Layer stiker depan / belakang</span>
      </section>

      <section class="home__cta" aria-label="Ajakan mulai">
        <p class="home__cta-title">Udah siap bikin strip kamu?</p>
        <p class="home__cta-sub">Butuh kurang dari 2 menit — dari pilih frame sampai foto tersimpan di galeri HP kamu.</p>
        <button type="button" class="btn btn--primary btn--lg" data-start>Mulai Fotobooth ✦</button>
        <a class="home__cta-alt" href="#/guide">atau baca tutorial dulu →</a>
      </section>

      <div class="sticky-bar" data-sticky>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-start>Mulai Fotobooth ✦</button>
      </div>
    </div>
  `;

  host.querySelector<HTMLElement>('.home__desc')!.textContent = site.description;

  // ---- showcase homepage: foto yang dicentang developer di #/admin ---------
  // (menggantikan strip contoh lama). Bentuk tampilan dipilih di dashboard
  // (10 pilihan), rasio kartu mengikuti ukuran asli foto / kanvas frame.
  // Kalau belum ada foto terpilih → 5 frame terpopuler (leaderboard) otomatis.
  const showcaseFig = host.querySelector<HTMLElement>('[data-showcase]')!;
  const showcaseBody = host.querySelector<HTMLElement>('[data-showcase-body]')!;
  const showcaseCap = host.querySelector<HTMLElement>('[data-showcase-cap]')!;
  const heroEl = host.querySelector<HTMLElement>('.home__hero')!;

  /** Rasio kartu = rasio asli gambar (foto) atau kanvas frame (frame overlay). */
  const useNaturalAspect = (img: HTMLImageElement): void => {
    const apply = (): void => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
    };
    img.addEventListener('load', apply, { once: true });
    if (img.complete) apply();
  };

  const hideShowcase = (): void => {
    showcaseFig.hidden = true;
    heroEl.classList.add('is-showcase-off');
  };

  /**
   * Kartu frame di showcase: TANPA kotak bungkus — kanvas frame sendirilah
   * yang tampil, besar, melintang penuh di bawah hero (lihat CSS
   * `.home__hero.is-frames-mode`). mode:
   *   'picked'     → frame yang dicentang developer (maks 5)
   *   'leaderboard'→ 5 frame terpopuler otomatis
   *   'default'    → fallback frame bawaan
   */
  const showFrames = (frames: TemplateDef[], mode: 'picked' | 'leaderboard' | 'default'): void => {
    if (frames.length === 0) {
      hideShowcase();
      return;
    }
    showcaseFig.classList.add('is-frames-mode');
    heroEl.classList.add('is-frames-mode');
    showcaseBody.classList.add('is-frames');
    showcaseBody.replaceChildren(
      ...frames.map((t, i) => {
        const img = document.createElement('img');
        img.className = 'home__showcase-frame';
        img.src = t.thumb;
        img.alt = `Frame ${t.name}`;
        img.loading = i < 2 ? 'eager' : 'lazy';
        img.style.aspectRatio = `${t.engine.canvas.width} / ${t.engine.canvas.height}`;
        img.title = `${t.name} — ${t.engine.photoSlots.length} foto · klik untuk pakai`;
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          saveTemplatePref(t.id);
          toast(`Frame “${t.name}” dipilih — tekan PILIH FRAME ✦`, 'success');
          navigate('/capture');
        });
        return img;
      }),
    );
    showcaseCap.innerHTML =
      mode === 'picked'
        ? '<a href="#/frames">🖼️ Frame pilihan developer — klik untuk melihat ✦</a>'
        : mode === 'leaderboard'
          ? '<a href="#/frames">🏆 5 frame terpopuler — pilih &amp; jepret ✦</a>'
          : '<a href="#/frames">Puluhan frame imut siap dipakai — pilih sekarang ✦</a>';
  };

  /** Leaderboard frame (top 5) di halaman beranda. */
  const renderPopular = (board: BoothLeaderboardEntry[]): void => {
    const sectionEl = host.querySelector<HTMLElement>('[data-popular]')!;
    const listEl = host.querySelector<HTMLElement>('[data-popular-list]')!;
    const rows = board
      .map((b) => ({ entry: b, tpl: getTemplate(b.id) ?? getTemplate(`booth-${b.id}`) }))
      .filter((r): r is { entry: BoothLeaderboardEntry; tpl: TemplateDef } => !!r.tpl)
      .slice(0, 5);
    if (rows.length === 0) return; // belum ada data pemakaian → sembunyikan
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    listEl.replaceChildren(
      ...rows.map(({ entry, tpl }, i) => {
        const li = document.createElement('li');
        li.className = 'home__popular-item';
        li.innerHTML = `
          <span class="home__popular-rank">${medals[i] ?? String(i + 1)}</span>
          <span class="home__popular-thumb">
            <img alt="" loading="lazy" />
            <span class="home__popular-count">${entry.count}×</span>
          </span>
          <span class="home__popular-meta">
            <span class="home__popular-name"></span>
            <span class="home__popular-cta">Pakai frame →</span>
          </span>
        `;
        const img = li.querySelector<HTMLImageElement>('img')!;
        img.src = tpl.thumb;
        img.alt = `Frame ${tpl.name}`;
        img.style.aspectRatio = `${tpl.engine.canvas.width} / ${tpl.engine.canvas.height}`;
        li.querySelector<HTMLElement>('.home__popular-name')!.textContent =
          `${tpl.name} · ${tpl.engine.photoSlots.length} foto`;
        li.addEventListener('click', () => {
          saveTemplatePref(tpl.id);
          toast(`Frame “${tpl.name}” dipilih — tekan PILIH FRAME ✦`, 'success');
          navigate('/capture');
        });
        return li;
      }),
    );
    sectionEl.hidden = false;
  };

  void (async () => {
    const photos: PublicPhoto[] = await fetchFeaturedPhotos();
    // force: ambil manifest segar — bentuk showcase & leaderboard boleh saja
    // berubah sejak halaman terakhir dikunjungi (dashboard admin).
    await initCatalog({ force: true }).catch(() => undefined);
    if (destroyed) return;

    // Bentuk tampilan showcase (dipilih di dashboard developer).
    const shape = getBoothShowcaseShape();
    if (isValidShowcaseShape(shape)) showcaseFig.classList.add(`home__showcase--${shape}`);

    const board = getBoothLeaderboard();
    renderPopular(board);

    // 1) PRIORITAS: frame yang dicentang developer di ⭐ Foto & frame homepage.
    //    Id disimpan sebagai TemplateDef (drop-in "booth-<folder>" / bawaan JSON).
    const picked = getBoothShowcaseFrames()
      .map(
        (id) =>
          getTemplate(id) ??
          getTemplate(`booth-${id.replace(/^booth-/, '')}`) ??
          getTemplate(id.replace(/^booth-/, '')),
      )
      .filter((t): t is TemplateDef => !!t && t.enabled)
      .slice(0, 5);
    if (picked.length > 0) {
      showFrames(picked, 'picked');
      return;
    }

    if (photos.length === 0) {
      // Otomatis: 5 frame paling sering dipakai tampil sebagai wajah beranda.
      const topFrames = board
        .map((b) => getTemplate(b.id) ?? getTemplate(`booth-${b.id}`))
        .filter((t): t is TemplateDef => !!t && t.enabled)
        .slice(0, 5);
      showFrames(topFrames.length > 0 ? topFrames : getEnabledTemplates().slice(0, 5), topFrames.length > 0 ? 'leaderboard' : 'default');
      return;
    }

    showcaseBody.classList.add('is-photos');
    const photoEls = photos.slice(0, 6).map((p, i) => {
      const img = document.createElement('img');
      img.className = 'home__showcase-img';
      img.alt = `Hasil fotostrip ${p.title}`;
      img.loading = i < 2 ? 'eager' : 'lazy';
      useNaturalAspect(img);
      img.src = photoImageUrl(p.id);
      return img;
    });
    showcaseBody.replaceChildren(...photoEls);
    // Bentuk "Pita Berjalan": gandakan item (aria-hidden) supaya animasi -50% mulus.
    if (shape === 'pita') {
      showcaseBody.append(
        ...photoEls.map((el) => {
          const clone = el.cloneNode() as HTMLImageElement;
          clone.setAttribute('aria-hidden', 'true');
          clone.loading = 'lazy';
          return clone;
        }),
      );
    }
    showcaseCap.innerHTML = '<a href="#/gallery">Hasil foto pilihan — intip galeri fotome ✦</a>';
    showcaseBody.addEventListener('click', () => navigate('/gallery'));
  })();

  // ---- navigasi fitur ------------------------------------------------------
  host.querySelectorAll<HTMLElement>('[data-start]').forEach((b) =>
    b.addEventListener('click', () => navigate('/capture')),
  );
  host.querySelectorAll<HTMLElement>('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => navigate(b.dataset.goto ?? '/')),
  );
  host.querySelector('[data-guide]')?.addEventListener('click', () => navigate('/guide'));
  host.querySelector('[data-frames]')?.addEventListener('click', () => navigate('/frames'));

  // ---- sticky bar: hanya mobile, sembunyi saat CTA hero terlihat ----------
  const sticky = host.querySelector<HTMLElement>('[data-sticky]')!;
  const heroCta = host.querySelector<HTMLElement>('.home__actions [data-start]');
  if (heroCta && 'IntersectionObserver' in window) {
    stickyObserver = new IntersectionObserver(
      ([entry]) => sticky.classList.toggle('is-hidden', entry?.isIntersecting ?? false),
      { threshold: 0.6 },
    );
    stickyObserver.observe(heroCta);
  }

  return () => {
    destroyed = true;
    stickyObserver?.disconnect();
  };
}
