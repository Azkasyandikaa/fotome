import type { StickerDef } from '../types';
import { getAllStickers } from '../services/template';

export interface StickerPickerCallbacks {
  onSticker: (s: StickerDef) => void;
  onEmoji: (char: string) => void;
}

const EMOJIS = ['😀', '😅', '😍', '🤩', '😎', '🥳', '😭', '🤣', '😇', '🙃', '❤️', '🔥', '✨', '🎉', '👑', '🌈', '⭐', '🍀', '🎈', '🎂'];

/** Tabbed panel of developer-provided stickers (searchable) plus emoji row. */
export function createStickerPicker(host: HTMLElement, cb: StickerPickerCallbacks): void {
  const all = getAllStickers();
  const categories = ['all', ...new Set(all.map((s) => s.category))];
  let category = 'all';
  let query = '';

  host.innerHTML = `
    <div class="sticker-picker">
      <div class="sticker-search">
        <svg class="sticker-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="sticker-search__input" type="search" placeholder="Cari stiker…" aria-label="Cari stiker" />
      </div>
      <div class="sticker-picker__tabs" role="tablist" aria-label="Kategori stiker"></div>
      <div class="sticker-picker__grid" role="list"></div>
      <div class="sticker-picker__emoji-grid" role="list" aria-label="Emoji"></div>
    </div>
  `;
  const searchInput = host.querySelector<HTMLInputElement>('.sticker-search__input')!;
  const tabsEl = host.querySelector<HTMLElement>('.sticker-picker__tabs')!;
  const gridEl = host.querySelector<HTMLElement>('.sticker-picker__grid')!;
  const emojiEl = host.querySelector<HTMLElement>('.sticker-picker__emoji-grid')!;

  function filtered(): StickerDef[] {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (!q) return true;
      return `${s.name} ${s.category} ${s.id}`.toLowerCase().includes(q);
    });
  }

  function renderTabs(): void {
    tabsEl.replaceChildren(
      ...categories.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (c === category ? ' is-active' : '');
        b.textContent = c === 'all' ? 'Semua' : c.charAt(0).toUpperCase() + c.slice(1);
        b.addEventListener('click', () => {
          category = c;
          renderTabs();
          renderGrid();
        });
        return b;
      }),
    );
  }

  function renderGrid(): void {
    const list = filtered();
    if (list.length === 0) {
      gridEl.innerHTML =
        '<p class="tpl-empty">Tidak ketemu.<br /><small>Taruh PNG baru di <code>public/booth/stickers/&lt;kategori&gt;/</code> lalu refresh.</small></p>';
      return;
    }
    gridEl.replaceChildren(
      ...list.map((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sticker-btn';
        b.title = s.name;
        b.setAttribute('aria-label', `Tambah stiker ${s.name}`);
        b.setAttribute('role', 'listitem');
        b.innerHTML = `<img src="${s.image}" alt="" loading="lazy" width="44" height="44" />`;
        b.addEventListener('click', () => cb.onSticker(s));
        return b;
      }),
    );
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderGrid();
  });

  emojiEl.replaceChildren(
    ...EMOJIS.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-btn';
      b.textContent = e;
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', `Tambah emoji ${e}`);
      b.addEventListener('click', () => cb.onEmoji(e));
      return b;
    }),
  );

  renderTabs();
  renderGrid();
}
