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
    const canvas = document.createElement('canvas');
    canvas.className = 'tpl-preview__canvas';
    this.previewHost.innerHTML = `
      <div class="tpl-preview">
        <div class="tpl-preview__card">
          <span class="tpl-preview__badge">PREVIEW</span>
          <div class="tpl-preview__stage"></div>
          <p class="tpl-preview__meta"></p>
        </div>
        <p class="tpl-preview__hint">
          <span>Contoh di atas pakai foto demo — fotomu sendiri menggantikan tiap slot.</span>
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

    const allDemo = await loadDemoPhotos();
    // Foto demo bisa diacak: setiap klik menggeser urutan foto ke slot —
    // preview terasa hidup dan tiap posisi slot bisa dicek matanya.
    let demoShift = 0;
    const paint = (): void => {
      const demo = allDemo.map((_, i) => allDemo[(i + demoShift) % allDemo.length]!);
      canvas.classList.add('is-painting');
      renderComposite(
        canvas,
        t,
        { id: 'preview', templateId: t.id, filterId: '', photos: demo },
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
