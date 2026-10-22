import type { TemplateDef } from '../types';
import { formatCategory, getCategories, searchTemplates } from '../services/template';
import { store, saveTemplatePref } from '../app/state';
import { mountScrollArrows } from './ScrollArrows';

/** Filter jumlah foto (slot) di baris chip picker kamera. */
type SlotFilter = 'all' | 1 | 2 | 3 | 4 | 5;

/**
 * Left rail: search, scrollable category chips (with ← → arrow buttons),
 * a 1–5 photo-count filter row, and big visual frame cards.
 */
export function createTemplatePicker(host: HTMLElement, onPick: (t: TemplateDef) => void): void {
  let query = '';
  let category = 'all';
  let slotFilter: SlotFilter = 'all';
  let cards: HTMLElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  const cleanups: (() => void)[] = [];

  host.innerHTML = `
    <div class="tpl-picker panel-card">
      <div class="tpl-picker__head">
        <h2 class="tpl-picker__title">Pilih Frame</h2>
        <div class="tpl-search">
          <svg class="tpl-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input class="tpl-search__input" type="search" placeholder="Cari frame…" aria-label="Cari template" />
        </div>
        <div class="scroll-row">
          <div class="tpl-cats" role="tablist" aria-label="Kategori template"></div>
        </div>
        <div class="scroll-row">
          <div class="tpl-slotfilter" role="radiogroup" aria-label="Jumlah foto frame" data-slotfilter>
            <button type="button" class="tpl-slotfilter__btn is-active" data-slots="all" role="radio" aria-checked="true">✨ Semua</button>
            <button type="button" class="tpl-slotfilter__btn" data-slots="1" role="radio" aria-checked="false">1 foto</button>
            <button type="button" class="tpl-slotfilter__btn" data-slots="2" role="radio" aria-checked="false">2 foto</button>
            <button type="button" class="tpl-slotfilter__btn" data-slots="3" role="radio" aria-checked="false">3 foto</button>
            <button type="button" class="tpl-slotfilter__btn" data-slots="4" role="radio" aria-checked="false">4 foto</button>
            <button type="button" class="tpl-slotfilter__btn" data-slots="5" role="radio" aria-checked="false">5 foto</button>
          </div>
        </div>
      </div>
      <div class="tpl-cards" role="list"></div>
    </div>

  `;

  searchInput = host.querySelector<HTMLInputElement>('.tpl-search__input');
  const catsEl = host.querySelector<HTMLElement>('.tpl-cats')!;
  const slotRow = host.querySelector<HTMLElement>('[data-slotfilter]')!;
  cards = host.querySelector<HTMLElement>('.tpl-cards');

  // Tombol ← → untuk baris kategori & baris jumlah foto.
  cleanups.push(mountScrollArrows(catsEl), mountScrollArrows(slotRow));

  // Pilih jumlah foto: frame dengan jumlah slot itu saja yang tampil.
  slotRow.querySelectorAll<HTMLButtonElement>('.tpl-slotfilter__btn').forEach((b) =>
    b.addEventListener('click', () => {
      const raw = b.dataset.slots ?? 'all';
      slotFilter = raw === 'all' ? 'all' : (Number(raw) as 1 | 2 | 3 | 4 | 5);
      slotRow.querySelectorAll('.tpl-slotfilter__btn').forEach((x) => {
        const on = x === b;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-checked', String(on));
      });
      renderCards();
    }),
  );

  function renderCategories(): void {
    const cats = getCategories();
    catsEl.replaceChildren(
      ...cats.map((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tpl-cat' + (c === category ? ' is-active' : '');
        btn.textContent = c === 'all' ? '✨ Semua' : formatCategory(c);
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(c === category));
        btn.addEventListener('click', () => {
          category = c;
          renderCategories();
          renderCards();
        });
        return btn;
      }),
    );
  }

  function renderCards(): void {
    if (!cards) return;
    const list = searchTemplates(query, category).filter(
      (t) => slotFilter === 'all' || t.engine.photoSlots.length === slotFilter,
    );
    if (list.length === 0) {
      cards.innerHTML =
        '<p class="tpl-empty">Tidak ada frame yang cocok.<br /><small>Taruh folder baru di <code>public/booth/templates/</code> lalu refresh.</small></p>';
      return;
    }
    const selectedId = store.get('selectedTemplateId');
    cards.replaceChildren(
      ...list.map((t) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'tpl-card' + (t.id === selectedId ? ' is-selected' : '');
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-pressed', String(t.id === selectedId));
        card.title = t.description;
        card.innerHTML = `
          <span class="tpl-card__frame"><img src="${t.thumb}" alt="" loading="lazy" width="96" height="160" /></span>
          <span class="tpl-card__meta">
            <span class="tpl-card__name"></span>
            <span class="tpl-card__cat">${formatCategory(t.category)} · ${t.engine.photoSlots.length} foto</span>
          </span>
          <span class="tpl-card__check" aria-hidden="true">✓</span>
        `;
        card.querySelector<HTMLElement>('.tpl-card__name')!.textContent = t.name;
        card.addEventListener('click', () => {
          saveTemplatePref(t.id);
          renderCards();
          onPick(t);
        });
        return card;
      }),
    );
  }

  searchInput?.addEventListener('input', () => {
    query = searchInput?.value ?? '';
    renderCards();
  });

  renderCategories();
  renderCards();
}
