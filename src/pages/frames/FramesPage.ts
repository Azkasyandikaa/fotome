import { navigate } from '../../app/router';
import { store, saveTemplatePref } from '../../app/state';
import {
  getEnabledTemplates,
  getCategories,
  initCatalog,
  formatCategory,
  syncShotCountToTemplate,
  templateInCategory,
} from '../../services/template';
import type { TemplateDef } from '../../types';
import { toast } from '../../components/toast';
import { mountScrollArrows } from '../../components/ScrollArrows';

/**
 * #/frames — fitur "Pilih frame".
 * Rumah baru untuk pemilihan bingkai (dulu Langkah 1 di beranda):
 *   - filter jumlah slot  : satu baris yang digulir kanan–kiri
 *   - kategori            : satu baris chip yang selalu tampil & digulir
 *                           kanan–kiri (tidak menutupi preview/grid)
 *   - settingan frame     : rotasi · ukuran · jepretan · kanvas
 * Pilihan tersimpan di localStorage & dipakai halaman #/capture.
 */
type SlotFilter = 'all' | 1 | 2 | 3 | 4 | 5;

export function mountFramesPage(host: HTMLElement): () => void {
  let destroyed = false;
  let slotFilter: SlotFilter = 'all';
  let category = 'all';
  let query = '';
  const cleanups: (() => void)[] = [];

  host.innerHTML = `
    <div class="frames frame-scroll container">
      <header class="frames__head">
        <div class="frames__head-row">
          <div class="frames__head-copy">
            <p class="label frames__kicker">✦ Fitur 1 — pilih bingkai</p>
            <h1 class="frames__title">Pilih frame</h1>
          </div>
          <div class="tpl-search frames__search">
            <svg class="tpl-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input class="tpl-search__input" type="search" data-search placeholder="Cari frame…" aria-label="Cari frame" />
          </div>
        </div>
        <p class="frames__sub">
          Rotasi foto, ukuran foto, dan jumlah jepretan otomatis ngikutin frame yang kamu pilih.
          Geser barisnya ke kanan–kiri untuk lihat semua pilihan.
        </p>
      </header>

      <section class="frame-filters" aria-label="Penyaring frame">
        <div class="frame-filters__group">
          <p class="frame-filters__label">
            <span>Kategori</span>
            <span class="frame-filters__hint" data-hint aria-hidden="true">geser →</span>
          </p>
          <div class="frame-filters__track" data-track>
            <div class="cat-row" data-catchips role="group" aria-label="Kategori frame"></div>
          </div>
        </div>

        <div class="frame-filters__group">
          <p class="frame-filters__label">
            <span>Jumlah foto</span>
            <span class="frame-filters__hint" data-hint aria-hidden="true">geser →</span>
          </p>
          <div class="frame-filters__track" data-track>
            <div class="slot-filter" role="radiogroup" aria-label="Jumlah slot frame" data-slotfilter>
              <button type="button" class="slot-filter__btn is-active" data-slots="all" role="radio" aria-checked="true">✨ Semua</button>
              <button type="button" class="slot-filter__btn" data-slots="1" role="radio" aria-checked="false">1 foto</button>
              <button type="button" class="slot-filter__btn" data-slots="2" role="radio" aria-checked="false">2 foto</button>
              <button type="button" class="slot-filter__btn" data-slots="3" role="radio" aria-checked="false">3 foto</button>
              <button type="button" class="slot-filter__btn" data-slots="4" role="radio" aria-checked="false">4 foto</button>
              <button type="button" class="slot-filter__btn" data-slots="5" role="radio" aria-checked="false">5 foto</button>
            </div>
          </div>
        </div>
      </section>

      <div class="frame-groups" data-templates aria-busy="true">
        <div class="skeleton skeleton--card"><span class="skeleton__shimmer"></span></div>
        <div class="skeleton skeleton--card"><span class="skeleton__shimmer"></span></div>
        <div class="skeleton skeleton--card"><span class="skeleton__shimmer"></span></div>
      </div>

      <aside class="frame-settings" data-framesettings hidden aria-live="polite">
        <p class="frame-settings__head">
          <span class="frame-settings__icon" aria-hidden="true">⚙️</span>
          Settingan frame <strong data-fs-name></strong>
        </p>
        <ul class="frame-settings__grid">
          <li class="frame-settings__item"><span>Jumlah jepretan</span><strong data-fs-shots>—</strong></li>
          <li class="frame-settings__item"><span>Rotasi foto</span><strong data-fs-rot>—</strong></li>
          <li class="frame-settings__item"><span>Ukuran foto</span><strong data-fs-zoom>—</strong></li>
          <li class="frame-settings__item"><span>Ukuran kanvas</span><strong data-fs-canvas>—</strong></li>
        </ul>
        <p class="frame-settings__note" data-fs-note></p>
      </aside>

      <div class="frames__cta">
        <button type="button" class="btn btn--ghost" data-preview>Lihat preview besar</button>
        <button type="button" class="btn btn--primary btn--lg" data-next>Lanjut ke jepretan ✦</button>
      </div>

      <div class="sticky-bar" data-sticky>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-next>Lanjut ke jepretan ✦</button>
      </div>
    </div>
  `;

  const templatesEl = host.querySelector<HTMLElement>('[data-templates]')!;
  const catsEl = host.querySelector<HTMLElement>('[data-catchips]')!;
  const frameSettingsEl = host.querySelector<HTMLElement>('[data-framesettings]')!;
  const searchInput = host.querySelector<HTMLInputElement>('[data-search]')!;

  // ---- baris yang digulir: kasih sisa-geser (fade + petunjuk "geser →") ----
  // Yang menggulir adalah anak dari .frame-filters__track (cat-row / slot-filter).
  const scrollRows = Array.from(host.querySelectorAll<HTMLElement>('.frame-filters__track > *'));

  // Tombol ← → di tepi tiap baris — biar pengunjung bisa geser pakai mouse
  // tanpa usaha. Muncul hanya kalau barisnya masih ada sisa guliran.
  cleanups.push(...scrollRows.map((row) => mountScrollArrows(row)));

  function syncTracks(): void {
    scrollRows.forEach((row) => {
      const track = row.parentElement;
      if (!track) return;
      const slack = row.scrollWidth - row.clientWidth;
      const atEnd = slack <= 2 || row.scrollLeft >= slack - 2;
      track.classList.toggle('is-start', row.scrollLeft <= 2);
      track.classList.toggle('is-end', atEnd);
      // Petunjuk "geser →" ada di label BARIS DI ATAS track (bukan di dalamnya),
      // jadi carinya dari group — dulu dicari dari track sehingga tidak pernah
      // ketemu dan hint selalu tampil walau barisnya muat semua.
      row
        .closest('.frame-filters__group')
        ?.querySelector<HTMLElement>('[data-hint]')
        ?.toggleAttribute('hidden', atEnd);
    });
  }

  scrollRows.forEach((row) => row.addEventListener('scroll', syncTracks, { passive: true }));
  window.addEventListener('resize', syncTracks);
  // Ukuran baris berubah saat chip selesai dirender / font selesai dimuat —
  // observer bikin status "geser →" & panah selalu ikut akurat.
  const rowObserver = new ResizeObserver(() => syncTracks());
  scrollRows.forEach((row) => rowObserver.observe(row));
  requestAnimationFrame(syncTracks); // ulang setelah chip/kartu selesai dirender

  host.querySelectorAll<HTMLElement>('[data-next]').forEach((b) =>
    b.addEventListener('click', () => navigate('/capture')),
  );
  host.querySelector('[data-preview]')?.addEventListener('click', () => navigate('/capture'));

  // ---- HP: ukur tinggi header & sticky bar supaya daftar frame pas layar ----
  // Tinggi header berubah (menu menutup/layar miring) — diukur langsung, bukan
  // angka tetap, agar area gulir frame tidak melebihi/boros layar.
  const sizeScrollArea = (): void => {
    if (window.innerWidth >= 768) {
      host.style.removeProperty('--frames-h');
      return;
    }
    const headerH = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 57;
    const stickyH = document.querySelector<HTMLElement>('[data-sticky]')?.offsetHeight ?? 72;
    host.style.setProperty('--frames-h', `${Math.max(240, window.innerHeight - headerH - stickyH)}px`);
  };
  sizeScrollArea();
  window.addEventListener('resize', sizeScrollArea);
  cleanups.push(() => window.removeEventListener('resize', sizeScrollArea));

  // ---- filter jumlah slot (satu baris, digulir kanan–kiri) ----------------
  const slotBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-slotfilter] .slot-filter__btn'));
  slotBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const raw = b.dataset.slots ?? 'all';
      slotFilter = raw === 'all' ? 'all' : (Number(raw) as 1 | 2 | 3 | 4 | 5);
      slotBtns.forEach((x) => {
        const on = x === b;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-checked', String(on));
      });
      renderTemplates();
    }),
  );

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderTemplates();
  });

  function renderCategoryChips(): void {
    const keepScroll = catsEl.scrollLeft; // ganti isi jangan bikin pita melompat ke awal
    catsEl.replaceChildren(
      ...getCategories().map((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip cat-chip' + (c === category ? ' is-active' : '');
        btn.textContent = c === 'all' ? '✨ Semua' : formatCategory(c);
        btn.setAttribute('aria-pressed', String(c === category));
        btn.addEventListener('click', () => {
          category = c;
          renderCategoryChips();
          renderTemplates();
          requestAnimationFrame(syncTracks);
        });
        return btn;
      }),
    );
    catsEl.scrollLeft = keepScroll;
    requestAnimationFrame(syncTracks);
  }

  void (async () => {
    try {
      // Force ambil manifest segar: frame yang baru di-upload admin harus
      // langsung tampil di sini tanpa reload browser.
      await initCatalog({ force: true });
    } catch {
      if (destroyed) return;
      renderTemplateEmpty(true);
      return;
    }
    if (destroyed) return;
    renderCategoryChips();
    renderTemplates();
  })();

  function renderTemplateEmpty(failed: boolean): void {
    templatesEl.setAttribute('aria-busy', 'false');
    templatesEl.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">${failed ? 'Template gagal dimuat.' : 'Belum ada frame.'}</p>
        <p class="empty-state__hint">Taruh folder frame di <code>public/booth/templates/</code> lalu muat ulang.</p>
        <button type="button" class="btn btn--secondary" data-reload>Muat Ulang</button>
      </div>
    `;
    templatesEl.querySelector('[data-reload]')?.addEventListener('click', () => window.location.reload());
  }

  function matchesQuery(t: TemplateDef): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [t.name, t.category, ...t.categories, ...t.keywords].join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  }

  /** Frame aktif yang lolos filter slot + kategori + pencarian. */
  function visibleTemplates(): TemplateDef[] {
    return getEnabledTemplates().filter((t) => {
      if (slotFilter !== 'all' && t.engine.photoSlots.length !== slotFilter) return false;
      if (!templateInCategory(t, category)) return false;
      return matchesQuery(t);
    });
  }

  function renderTemplates(): void {
    const all = getEnabledTemplates();
    templatesEl.setAttribute('aria-busy', 'false');

    if (all.length === 0) {
      renderTemplateEmpty(false);
      return;
    }

    // Pastikan selalu ada frame terpilih + jumlah jepretan sinkron dengan slotnya.
    if (!all.some((t) => t.id === store.get('selectedTemplateId'))) {
      saveTemplatePref(all[0]!.id);
    }
    const selected = all.find((t) => t.id === store.get('selectedTemplateId'))!;
    syncShotCountToTemplate(selected);
    renderFrameSettings(selected);

    const list = visibleTemplates();
    if (list.length === 0) {
      templatesEl.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">${
            query.trim()
              ? 'Tidak ada frame yang cocok.'
              : slotFilter === 'all'
                ? 'Tidak ada frame di filter ini.'
                : `Belum ada frame dengan ${slotFilter} slot.`
          }</p>
          <p class="empty-state__hint">Coba pilih “✨ Semua” atau kategori lain.</p>
          <button type="button" class="btn btn--secondary" data-resetfilter>Tampilkan semua</button>
        </div>
      `;
      templatesEl.querySelector('[data-resetfilter]')?.addEventListener('click', () => {
        slotFilter = 'all';
        category = 'all';
        query = '';
        searchInput.value = '';
        slotBtns.forEach((x) => {
          const on = x.dataset.slots === 'all';
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-checked', String(on));
        });
        renderCategoryChips();
        renderTemplates();
      });
      return;
    }

    const groupNames: Record<number, string> = {
      1: 'Sekali jepret',
      2: 'Dua jepretan',
      3: 'Tiga jepretan',
      4: 'Empat jepretan',
      5: 'Lima jepretan',
    };

    templatesEl.replaceChildren(
      ...([1, 2, 3, 4, 5] as const)
        .map((n) => ({ n, items: list.filter((t) => t.engine.photoSlots.length === n) }))
        .filter((g) => g.items.length > 0)
        .map((g) => {
          const section = document.createElement('section');
          section.className = 'frame-group';
          section.setAttribute('role', 'group');

          const head = document.createElement('div');
          head.className = 'frame-group__head';
          head.innerHTML = `
            <span class="frame-group__count" aria-hidden="true">${g.n}</span>
            <span class="frame-group__title">${g.n} foto</span>
            <span class="frame-group__sub">${groupNames[g.n] ?? ''}</span>
          `;

          const grid = document.createElement('div');
          grid.className = 'template-grid';
          grid.setAttribute('role', 'list');
          grid.append(
            ...g.items.map((t) => {
              const isSelected = t.id === selected.id;
              const card = document.createElement('button');
              card.type = 'button';
              card.className = 'template-card' + (isSelected ? ' is-selected' : '');
              card.setAttribute('role', 'listitem');
              card.setAttribute('aria-pressed', String(isSelected));
              card.title = t.description;
              card.innerHTML = `
                <span class="template-card__thumb">
                  <img src="${t.thumb}" alt="" loading="lazy" width="96" height="170" />
                  <span class="template-card__slots" aria-hidden="true">${g.n}✕</span>
                  <span class="template-card__badge" ${isSelected ? '' : 'hidden'}>Dipilih ✦</span>
                </span>
                <span class="template-card__name"></span>
                <span class="template-card__meta"></span>
              `;
              card.querySelector<HTMLElement>('.template-card__name')!.textContent = t.name;
              card.querySelector<HTMLElement>('.template-card__meta')!.textContent =
                `${g.n} slot · ${formatCategory(t.category)}`;
              card.addEventListener('click', () => {
                saveTemplatePref(t.id);
                // Settingan frame (jepretan &co) langsung ikut berubah.
                syncShotCountToTemplate(t);
                renderFrameSettings(t);
                renderTemplates();
                toast(`Frame “${t.name}” dipilih — ${g.n} jepretan.`, 'success');
              });
              return card;
            }),
          );

          section.append(head, grid);
          return section;
        }),
    );
  }

  /** Panel settingan frame: rotasi · ukuran · jepretan · kanvas. */
  function renderFrameSettings(t: TemplateDef): void {
    const slots = t.engine.photoSlots;
    const style = t.engine.photoStyle;
    frameSettingsEl.hidden = false;
    frameSettingsEl.querySelector<HTMLElement>('[data-fs-name]')!.textContent = `“${t.name}”`;
    frameSettingsEl.querySelector<HTMLElement>('[data-fs-shots]')!.textContent = `${slots.length} foto`;

    const rots = slots.map((s) => s.rotation ?? style?.rotation ?? 0);
    const sameRot = rots.every((r) => r === rots[0]);
    const fmtDeg = (r: number): string => `${r > 0 ? '+' : ''}${r}°`;
    frameSettingsEl.querySelector<HTMLElement>('[data-fs-rot]')!.textContent = sameRot
      ? rots[0] === 0
        ? '0° — lurus'
        : `${fmtDeg(rots[0]!)} — miring`
      : rots.map(fmtDeg).join(' · ');

    const zooms = slots.map((s) => s.scale ?? style?.scale ?? 1);
    const sameZoom = zooms.every((z) => z === zooms[0]);
    frameSettingsEl.querySelector<HTMLElement>('[data-fs-zoom]')!.textContent = sameZoom
      ? `${zooms[0]!.toFixed(2).replace(/\.00$/, '')}× pas`
      : zooms.map((z) => `${z}×`).join(' · ');

    frameSettingsEl.querySelector<HTMLElement>('[data-fs-canvas]')!.textContent =
      `${t.engine.canvas.width} × ${t.engine.canvas.height} px`;

    frameSettingsEl.querySelector<HTMLElement>('[data-fs-note]')!.textContent =
      `Frame ini butuh ${slots.length} jepretan — kamera berhenti otomatis setelah slot penuh. ` +
      `Semua frame bebas dipakai kapan saja.`;
  }

  return () => {
    destroyed = true;
    window.removeEventListener('resize', syncTracks);
    rowObserver.disconnect();
    scrollRows.forEach((row) => row.removeEventListener('scroll', syncTracks));
    cleanups.forEach((fn) => fn());
  };
}
