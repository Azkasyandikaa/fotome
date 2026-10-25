import type { ImageBitmap } from '../types/dom-shims';
import type { TemplateDef } from '../types';
import { createTemplatePicker } from './TemplatePicker';
import { renderComposite, preloadTemplateAssets, setCanvasRepaintHook } from '../services/canvas';
import { initCatalog } from '../services/template';
import { saveTemplatePref, store, normalizePhotoCount } from '../app/state';
import { toast } from './toast';

export interface StripPreviewCallbacks {
  /** User pressed PILIH — switch to camera mode. */
  onConfirm: () => void;
  /** User pressed ULANGI in camera mode — back to picking. */
  onRetake: () => void;
}

/**
 * Left panel state machine:
 * - pick: template list, right side shows a big preview (separate element).
 * - strip: the chosen template with photos dropping into slots one by one.
 */
export class StripPreview {
  private host: HTMLElement;
  private previewHost: HTMLElement;
  private template: TemplateDef | null = null;
  private photos: ImageBitmap[] = [];
  private mode: 'pick' | 'strip' = 'pick';
  private cb: StripPreviewCallbacks;
  private canvas: HTMLCanvasElement | null = null;

  constructor(host: HTMLElement, previewHost: HTMLElement, cb: StripPreviewCallbacks) {
    this.host = host;
    this.previewHost = previewHost;
    this.cb = cb;
  }

  /** Phase 1: picker on the left, big preview on the right. */
  async showPicker(): Promise<void> {
    this.mode = 'pick';
    this.template = null;
    this.photos.forEach((p) => p.close());
    this.photos = [];
    // Manifest segar setiap picker dibuka — upload frame admin langsung tampil.
    await initCatalog({ force: true });

    this.host.innerHTML = `
      <div class="strip-pick">
        <div class="tpl-slot"></div>
        <button type="button" class="btn btn--primary btn--block" data-act="choose" disabled>PILIH TEMPLATE</button>
      </div>
    `;
    this.previewHost.innerHTML = `
      <div class="tpl-preview">
        <p class="tpl-preview__hint">
          <strong class="tpl-preview__hint-title">Belum ada frame dipilih ✦</strong>
          <span>Klik salah satu frame di panel kiri — preview besarnya langsung muncul di sini, lengkap dengan lubang fotonya.</span>
        </p>
      </div>
    `;

    createTemplatePicker(this.host.querySelector<HTMLElement>('.tpl-slot')!, (t) => {
      this.template = t;
      const btn = this.host.querySelector<HTMLButtonElement>('[data-act="choose"]');
      if (btn) {
        btn.disabled = false;
        btn.textContent = `PILIH: ${t.name.toUpperCase()}`;
      }
      void this.drawBigPreview(t);
    });

    this.host.querySelector('[data-act="choose"]')?.addEventListener('click', () => {
      if (!this.template) return;
      saveTemplatePref(this.template.id);
      this.cb.onConfirm();
    });
  }

  /** Draw the chosen template large, with placeholder slots. */
  private async drawBigPreview(t: TemplateDef): Promise<void> {
    // Preload FRAME + background SEKALI di awal: frame pada paint pertama
    // sudah lengkap — akurat, tanpa telat, tanpa repaint berkedip.
    await preloadTemplateAssets(t);
    if (this.mode !== 'pick' || (this.template && this.template.id !== t.id)) return;
    const allDemo = await loadDemoPhotos();
    // Slot yang BELUM punya contoh foto (pool demo cuma 3) → tile
    // "COMING SOON" di kanvas + chip badge di atas preview, biar jelas
    // itu slot kosong, bukan render yang rusak.
    const maxPhotoIndex = Math.max(0, ...t.engine.photoSlots.map((s) => s.photoIndex));
    const soonIndexes = t.engine.photoSlots
      .map((s) => s.photoIndex)
      .filter((p) => p >= allDemo.length)
      .sort((a, b) => a - b);
    const soonTiles = new Map<number, ImageBitmap>();
    for (const slot of t.engine.photoSlots) {
      if (slot.photoIndex >= allDemo.length) {
        soonTiles.set(slot.photoIndex, await comingSoonTile(slot.width, slot.height));
      }
    }
    const soonRange =
      soonIndexes.length === 0
        ? ''
        : soonIndexes.length === 1
          ? `slot ${soonIndexes[0]! + 1}`
          : `slot ${soonIndexes[0]! + 1}–${soonIndexes[soonIndexes.length - 1]! + 1}`;
    const hintBase = 'Contoh di atas pakai foto demo — fotomu sendiri menggantikan tiap slot.';
    const hintSoon = soonRange
      ? `${soonRange.replace('slot', 'Slot')} belum punya contoh foto (coming soon) — fotomu tetap bisa masuk.`
      : '';

    const canvas = document.createElement('canvas');
    canvas.className = 'tpl-preview__canvas';
    this.previewHost.innerHTML = `
      <div class="tpl-preview">
        <div class="tpl-preview__card">
          <div class="tpl-preview__badges">
            <span class="tpl-preview__badge">PREVIEW</span>
            ${soonRange ? `<span class="tpl-preview__badge tpl-preview__badge--soon">${soonRange} · coming soon</span>` : ''}
          </div>
          <div class="tpl-preview__stage"></div>
          <p class="tpl-preview__meta"></p>
        </div>
        <p class="tpl-preview__hint">
          <span>${hintBase}</span>
          ${
            hintSoon
              ? `<span class="tpl-preview__hint-soon">${hintSoon}</span>`
              : ''
          }
          <span class="tpl-preview__hint-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-act="shuffle">⤨ Ganti Foto Demo</button>
            <button type="button" class="btn btn--primary tpl-preview__use" data-act="use">PAKAI FRAME INI ✦</button>
          </span>
        </p>
      </div>
    `;
    this.previewHost.querySelector<HTMLElement>('.tpl-preview__stage')!.appendChild(canvas);
    const meta = this.previewHost.querySelector<HTMLElement>('.tpl-preview__meta')!;
    meta.textContent = `${t.name} — ${t.description}`;
    this.previewHost.querySelector('[data-act="use"]')?.addEventListener('click', () => {
      saveTemplatePref(t.id);
      this.cb.onConfirm();
    });
    const { canvas: spec } = t.engine;
    const stage = this.previewHost.querySelector<HTMLElement>('.tpl-preview__stage')!;
    const availW = stage.clientWidth || 360;
    const availH = stage.clientHeight || 560;
    const cssScale = Math.min(availW / spec.width, availH / spec.height);
    canvas.style.width = `${Math.round(spec.width * cssScale)}px`;
    canvas.style.height = `${Math.round(spec.height * cssScale)}px`;

    // Foto demo bisa diacak: setiap klik menggeser urutan foto ke slot —
    // preview terasa hidup dan tiap posisi slot bisa dicek matanya.
    // Slot tanpa contoh foto (photoIndex ≥ pool demo) diisi tile COMING SOON.
    let demoShift = 0;
    const paint = (): void => {
      const photos: ImageBitmap[] = Array.from({ length: maxPhotoIndex + 1 }, (_, i) =>
        i < allDemo.length ? allDemo[(i + demoShift) % allDemo.length]! : soonTiles.get(i)!,
      );
      canvas.classList.add('is-painting');
      renderComposite(
        canvas,
        t,
        { id: 'preview', templateId: t.id, filterId: '', photos },
        [],
        {},
      );
      requestAnimationFrame(() => canvas.classList.remove('is-painting'));
    };
    this.previewHost.querySelector('[data-act="shuffle"]')?.addEventListener('click', () => {
      demoShift = (demoShift + 1) % Math.max(1, allDemo.length);
      paint();
    });

    // Demo foto dulu, FRAME sudah pasti siap (di-preload di atas) —
    // satu kali gambar, tampil utuh seketika tanpa kedip/telat.
    paint();
  }

  /** Phase 2: camera mode — the panel becomes the live strip. */
  showStrip(template: TemplateDef): void {
    this.mode = 'strip';
    this.template = template;
    this.host.innerHTML = `
      <div class="strip-live panel-card">
        <div class="strip-live__topline">
          <h2 class="strip-live__title"></h2>
          <span class="strip-live__badge">LIVE</span>
        </div>
        <div class="strip-live__stage"><canvas class="strip-live__canvas"></canvas></div>
        <ol class="strip-live__steps" aria-label="Progres foto">
          ${Array.from(
            { length: normalizePhotoCount(store.get('photoCount')) },
            (_, i) => `<li data-step="${i}">${i + 1}</li>`,
          ).join('')}
        </ol>
        <button type="button" class="btn btn--ghost btn--sm btn--block" data-act="change">GANTI TEMPLATE</button>
      </div>
    `;
    this.host.querySelector<HTMLElement>('.strip-live__title')!.textContent = template.name;
    this.canvas = this.host.querySelector('.strip-live__canvas');
    // Frame/bg telat termuat → repaint sekali otomatis, strip tidak pernah
    // tampil polos menunggu gambar.
    if (this.canvas) setCanvasRepaintHook(this.canvas, () => this.draw());
    // Aset frame di-preload dulu supaya paint pertama sudah utuh.
    void preloadTemplateAssets(template).then(() => {
      if (this.mode === 'strip' && this.template?.id === template.id) this.draw();
    });
    this.host.querySelector('[data-act="change"]')?.addEventListener('click', () => this.cb.onRetake());
    this.draw();
  }

  /** Called by the page after each shot. */
  addPhoto(photo: ImageBitmap): void {
    if (this.mode !== 'strip') return;
    this.photos.push(photo);
    this.draw();
    const step = this.host.querySelector<HTMLElement>(`[data-step="${this.photos.length - 1}"]`);
    step?.classList.add('is-done');
  }

  /** Drop the newest slot (photo is closed by the Camera) and redraw. */
  removeLast(): void {
    this.photos.pop();
    if (this.mode === 'strip' && this.template) {
      const step = this.host.querySelector<HTMLElement>(`[data-step="${this.photos.length}"]`);
      step?.classList.remove('is-done');
      this.draw();
    }
  }

  reset(): void {
    this.photos.forEach((p) => p.close());
    this.photos = [];
    if (this.mode === 'strip' && this.template) {
      this.host.querySelectorAll('.strip-live__steps li').forEach((el) => el.classList.remove('is-done'));
      this.draw();
    }
  }

  /** Redraw the strip composite. */
  private draw(): void {
    if (!this.canvas || !this.template) return;
    const t = this.template;
    const { canvas: spec } = t.engine;
    const stage = this.host.querySelector<HTMLElement>('.strip-live__stage');
    if (!stage) return;
    const availW = stage.clientWidth || 300;
    const availH = stage.clientHeight || 520;
    const cssScale = Math.min(availW / spec.width, availH / spec.height);
    this.canvas.style.width = `${Math.round(spec.width * cssScale)}px`;
    this.canvas.style.height = `${Math.round(spec.height * cssScale)}px`;
    renderComposite(this.canvas, t, { id: 'live', templateId: t.id, filterId: '', photos: this.photos }, [], {});
    // Kilat halus tiap foto baru masuk slot — strip terasa "hidup".
    this.canvas.classList.add('is-painting');
    requestAnimationFrame(() => requestAnimationFrame(() => this.canvas?.classList.remove('is-painting')));
  }

  /** Photos currently held (for session creation on confirm). */
  getPhotos(): ImageBitmap[] {
    return this.photos;
  }

  getTemplateId(): string {
    return store.get('selectedTemplateId');
  }

  notifyFrame(message: string): void {
    toast(message, 'info');
  }
}

/**
 * Tile "COMING SOON" untuk slot yang belum punya contoh foto (pool demo
 * cuma 3, jadi slot 4 & 5 pada template 4/5-foto dulu kosong).
 * Dibuat SE-RASIO slot supaya fit "cover" tidak memotong tulisannya,
 * lalu di-cache per rasio — bitmap tidak pernah di-close (seperti demoCache).
 */
async function comingSoonTile(slotW: number, slotH: number): Promise<ImageBitmap> {
  const ratio = slotW / Math.max(1, slotH);
  const key = ratio.toFixed(3);
  const cache = (soonCache ??= new Map<string, ImageBitmap>());
  const hit = cache.get(key);
  if (hit) return hit;

  await ensurePreviewFonts();
  let w = 760;
  let h = Math.max(1, Math.round(w / ratio));
  if (h > 2400) {
    w = Math.max(240, Math.round((w * 2400) / h));
    h = 2400;
  } else if (h < 170) {
    const k = 170 / h;
    w = Math.round(w * k);
    h = 170;
  }

  const cnv = document.createElement('canvas');
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext('2d');
  if (ctx) paintComingSoon(ctx, w, h);
  const bmp = await createImageBitmap(cnv);
  cache.set(key, bmp);
  return bmp;
}

let soonCache: Map<string, ImageBitmap> | null = null;

/** Pastikan font komik sudah termuat sebelum teks tile digambar ke canvas. */
async function ensurePreviewFonts(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load("400 48px 'Bangers'"),
      fonts.load("700 24px 'Plus Jakarta Sans'"),
    ]);
  } catch {
    /* fallback font sudah cukup */
  }
}

/** Gambar tile kosmik: langit angkasa + nebula + bintang + tulisan komik. */
function paintComingSoon(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 1. Langit angkasa dalam
  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, '#0a0f2c');
  sky.addColorStop(0.55, '#1a1250');
  sky.addColorStop(1, '#3a1258');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 2. Kabut nebula magenta / indigo / plasma cyan
  const blob = (x: number, y: number, r: number, color: string): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  blob(w * 0.18, h * 0.24, Math.max(w, h) * 0.6, 'rgba(255, 78, 155, 0.32)');
  blob(w * 0.6, h * 0.08, Math.max(w, h) * 0.45, 'rgba(79, 59, 234, 0.4)');
  blob(w * 0.84, h * 0.82, Math.max(w, h) * 0.5, 'rgba(47, 214, 201, 0.22)');

  // 3. Bintang — seed tetap supaya tiap slot identik
  let seed = 7919;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const starColors = ['#ffffff', '#ffc53d', '#8fb3ff', '#ff9ecb'];
  const stars = Math.min(240, Math.round((w * h) / 7000));
  for (let i = 0; i < stars; i++) {
    ctx.fillStyle = starColors[Math.floor(rnd() * starColors.length)]!;
    ctx.globalAlpha = 0.45 + rnd() * 0.5;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 4. Halftone komik tipis
  const step = Math.max(16, Math.round(Math.min(w, h) / 12));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. Bingkai dashed ala stiker komik
  const inset = Math.max(8, Math.min(w, h) * 0.045);
  const r = inset * 1.4;
  ctx.setLineDash([inset * 0.9, inset * 0.7]);
  ctx.lineWidth = Math.max(3, inset * 0.34);
  ctx.strokeStyle = '#ffc53d';
  ctx.beginPath();
  ctx.moveTo(inset + r, inset);
  ctx.arcTo(w - inset, inset, w - inset, h - inset, r);
  ctx.arcTo(w - inset, h - inset, inset, h - inset, r);
  ctx.arcTo(inset, h - inset, inset, inset, r);
  ctx.arcTo(inset, inset, w - inset, inset, r);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // 6. Tulisan: ukuran dikecilkan otomatis sampai muat di dalam bingkai
  const cx = w / 2;
  const title = 'COMING SOON';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let size = Math.min(w * 0.13, h * 0.3);
  const measure = (s: number): number => {
    ctx.font = `400 ${s}px 'Bangers', 'Luckiest Guy', 'Trebuchet MS', sans-serif`;
    return ctx.measureText(title).width;
  };
  const maxTextW = w - inset * 3;
  let tw = measure(size);
  while (tw > maxTextW && size > 12) {
    size *= 0.94;
    tw = measure(size);
  }

  const subSize = Math.max(11, Math.min(size * 0.4, w * 0.045));
  const showSub = size * 1.9 + subSize * 1.6 <= h - inset * 2;
  const titleY = showSub ? h * 0.44 : h * 0.5;

  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = 'rgba(7, 11, 38, 0.92)';
  ctx.strokeText(title, cx, titleY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, cx, titleY);

  if (showSub) {
    const subY = titleY + size * 0.78;
    ctx.font = `700 ${subSize}px 'Plus Jakarta Sans', 'Nunito', sans-serif`;
    ctx.lineWidth = Math.max(2, subSize * 0.3);
    ctx.strokeStyle = 'rgba(7, 11, 38, 0.85)';
    ctx.strokeText('contoh foto menyusul ✦', cx, subY);
    ctx.fillStyle = '#ffc53d';
    ctx.fillText('contoh foto menyusul ✦', cx, subY);
  }
}

let demoCache: ImageBitmap[] | null = null;

/**
 * Cute gradient placeholders shown inside template preview slots.
 * Bitmaps live for the whole tab and are only ever drawn (read-only) —
 * never close() them, the cache would break on the second template.
 */
async function loadDemoPhotos(): Promise<ImageBitmap[]> {
  if (demoCache) return demoCache;
  if (demoCache === null) demoCache = [];
  const palettes: Array<[string, string, string]> = [
    ['#ffd1e3', '#ff8fb6', '#8a4d6f'],
    ['#ffe9c9', '#ffb570', '#8a5a2b'],
    ['#d9e6ff', '#8fb3ff', '#3d4d80'],
  ];
  const out: ImageBitmap[] = [];
  for (const [a, b, c] of palettes) {
    const cnv = document.createElement('canvas');
    cnv.width = 900;
    cnv.height = 520;
    const ctx = cnv.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 900, 520);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 900, 520);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(450, 250, 95, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(450, 215, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(450, 330, 130, 80, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = "700 44px 'Trebuchet MS', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('✦ foto demo ✦', 450, 470);
    }
    out.push(await createImageBitmap(cnv));
  }
  demoCache = out;
  return out;
}
