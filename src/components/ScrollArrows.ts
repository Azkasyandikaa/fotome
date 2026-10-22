/**
 * Tombol gulir ← → untuk baris chip yang digulir horizontal (kategori frame,
 * filter slot, dll). Dipasang di tepi kiri/kanan baris; disembunyikan otomatis
 * kalau arah itu sudah mentok atau barisnya muat semua.
 *
 * Pakai: mountScrollArrows(rowElement) → fungsi cleanup.
 */
export function mountScrollArrows(row: HTMLElement): () => void {
  const wrap = row.parentElement;
  if (!wrap) return () => undefined;
  wrap.classList.add('scroll-row');

  const mk = (dir: -1 | 1): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scroll-arrow scroll-arrow--${dir === -1 ? 'left' : 'right'}`;
    b.innerHTML = dir === -1 ? '‹' : '›';
    b.setAttribute('aria-label', dir === -1 ? 'Geser ke kiri' : 'Geser ke kanan');
    b.addEventListener('click', () => {
      row.scrollBy({ left: dir * Math.max(160, Math.round(row.clientWidth * 0.7)), behavior: 'smooth' });
    });
    wrap.appendChild(b);
    return b;
  };

  const left = mk(-1);
  const right = mk(1);

  const sync = (): void => {
    const slack = row.scrollWidth - row.clientWidth;
    const overflow = slack > 4;
    wrap.classList.toggle('is-scrollable', overflow);
    left.hidden = !overflow || row.scrollLeft <= 4;
    right.hidden = !overflow || row.scrollLeft >= slack - 4;
  };

  row.addEventListener('scroll', sync, { passive: true });
  // ResizeObserver (bukan window.resize) supaya listener tidak menumpuk
  // saat picker dipasang/buang berkali-kali — lepas sendiri ikut elemennya.
  const ro = new ResizeObserver(sync);
  ro.observe(row);
  requestAnimationFrame(sync);

  return () => {
    row.removeEventListener('scroll', sync);
    ro.disconnect();
    left.remove();
    right.remove();
    wrap.classList.remove('scroll-row', 'is-scrollable');
  };
}
