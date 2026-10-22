import type { Layer, PhotoTransform, Session, StickerDef, TemplateDef } from '../types';
import {
  renderComposite,
  renderFinal,
  loadImageCached,
  handleHitTest,
  photoHandleTarget,
  setCanvasRepaintHook,
  slotIndexOfPhoto,
  type HandleTarget,
} from '../services/canvas';
import {
  saveDraftLayers,
  loadDraftLayers,
  loadDraftPhotos,
  setPendingExport,
} from '../services/exportResult';
import { toast } from './toast';
import { navigate } from '../app/router';

export interface PhotoEditorCallbacks {
  /** Fired when the user finishes so the capture page can reset cleanly. */
  onFinished: () => void;
}

const MIN_SIZE = 40;
/** Zoom foto di dalam lubang slot: dari sedikit lebih kecil sampai 3×. */
const PHOTO_MIN_ZOOM = 0.6;
const PHOTO_MAX_ZOOM = 3;

/** Satu langkah undo: layer + transformasi foto ikut tersimpan. */
interface EditorSnapshot {
  layers: Layer[];
  photos: (PhotoTransform | undefined)[];
}

/**
 * Canvas photo editor.
 * - Photos sit in fixed template slots; decorate each via the photo tabs.
 * - Stickers/emoji: drag to move, corner dots to resize (W/H independent),
 *   top knob to rotate — all by hand on the canvas (mouse + touch).
 * - Pen tool draws freehand strokes onto the current photo.
 * - Undo/redo for everything.
 */
export class PhotoEditor {
  private template: TemplateDef;
  private session: Session;
  private layers: Layer[] = [];
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private activeIndex = -1;
  private activeSlot = 0;
  /** Foto tersorot (handle zoom/geser/putar tampil di lubang frame). */
  private photoSelected = false;
  /** Transformasi foto per indeks slot — undefined = pas seperti frame. */
  private photoTransforms: (PhotoTransform | undefined)[] = [];
  private canvas: HTMLCanvasElement | null = null;
  /** Ukuran area stage (di-cache lewat ResizeObserver — drag tidak pernah
   *  memaksa layout ulang tiap gerakan pointer). */
  private stageW = 0;
  private stageH = 0;
  private stageObs: ResizeObserver | null = null;
  private destroyed = false;
  private onFinished: () => void;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // tool state
  private tool: 'none' | 'pen' | 'eraser' = 'none';
  private penColor = '#e0526e';
  private penWidth = 10;
  /** Eraser radius in template-space px (scaled with previewScale at render). */
  private eraserRadius = 30;
  /** Live rubber-circle position (template space) for the hover preview. */
  private eraserPos: { x: number; y: number } | null = null;
  private eraserRaf = 0;
  private currentStroke: Layer | null = null;

  /** Original size of each layer, so manual sliders can express % of natural size. */
  private baseDims = new Map<Layer, { width: number; height: number }>();

  constructor(host: HTMLElement, template: TemplateDef, session: Session, cb: PhotoEditorCallbacks) {
    this.template = template;
    this.session = session;
    this.onFinished = cb.onFinished;
    // "Edit Ulang" from #/download comes back here — restore the draft layers.
    const draft = loadDraftLayers(session.id);
    const draftPhotos = loadDraftPhotos(session.id);
    if (draftPhotos) this.photoTransforms = draftPhotos;
    if (draft && draft.length > 0) {
      this.layers = draft;
      for (const l of this.layers) {
        this.baseDims.set(l, { width: l.width, height: l.height });
      }
      this.activeIndex = -1;
    }
    this.render(host);
    this.bindManualControls(host);
    void this.rerender();
  }

  // ---------- UI ----------

  private render(host: HTMLElement): void {
    host.innerHTML = `
      <div class="editor is-fullview">
        <div class="editor__stage-wrap"><div class="editor__stage"></div></div>
        <div class="editor__panel">
          <div class="editor__photos" role="tablist" aria-label="Pilih foto untuk diedit"></div>

          <div class="editor__tools">
            <p class="editor__section-title">Alat gambar</p>
            <div class="editor__tool-row">
            <button type="button" class="chip" data-tool="pen" aria-pressed="false">✏️ Gambar</button>
            <button type="button" class="chip" data-tool="eraser" aria-pressed="false">🧽 Hapus Coretan</button>
            </div>
            <div class="pen-colors" hidden>
              ${['#e0526e', '#f2b134', '#3fa7d6', '#59b96f', '#23252b', '#fffdf8']
                .map((c) => `<button type="button" class="pen-color" data-color="${c}" style="background:${c}" aria-label="Warna ${c}"></button>`)
                .join('')}
              <input type="range" class="pen-size" min="2" max="40" value="10" aria-label="Tebal goresan" />
            </div>
            <div class="eraser-size" hidden>
              <label class="eraser-size__label">Bulat penghapus</label>
              <input type="range" class="eraser-size-input" min="10" max="80" step="2" value="30" aria-label="Ukuran penghapus" />
            </div>
          </div>

          <div class="editor__stickers">
            <p class="editor__section-title">Stiker &amp; emoji</p>
            <div class="editor__stickers-slot"></div>
          </div>

          <div class="editor__props" hidden>
            <p class="editor__section-title">Stiker terpilih</p>
            <div class="prop-row">
              <button type="button" class="btn btn--ghost btn--sm" data-prop="delete">Hapus</button>
              <button type="button" class="btn btn--ghost btn--sm" data-prop="backward" title="Turunkan satu layer">⬇ Mundur</button>
              <button type="button" class="btn btn--ghost btn--sm" data-prop="forward" title="Naikkan satu layer">⬆ Maju</button>
            </div>
            <div class="prop-row">
              <button type="button" class="btn btn--ghost btn--sm" data-prop="send-back">Ke belakang</button>
              <button type="button" class="btn btn--ghost btn--sm" data-prop="bring-front">Ke depan</button>
            </div>
            <div class="prop-row">
              <button type="button" class="chip prop-frame-toggle" data-prop="toggle-frame" aria-pressed="true">🖼️ Di atas frame</button>
            </div>

            <div class="manual-controls" aria-label="Pengaturan manual stiker">
              <p class="manual-controls__title">Pengaturan manual</p>
              <label class="manual-ctrl">
                <span>Lebar</span>
                <input type="range" data-mc="width" min="0.05" max="3" step="0.01" />
                <output>100%</output>
              </label>
              <label class="manual-ctrl">
                <span>Tinggi</span>
                <input type="range" data-mc="height" min="0.05" max="3" step="0.01" />
                <output>100%</output>
              </label>
              <label class="manual-ctrl">
                <span>Ukuran</span>
                <input type="range" data-mc="scale" min="0.05" max="3" step="0.01" />
                <output>100%</output>
              </label>
              <label class="manual-ctrl">
                <span>Putar</span>
                <input type="range" data-mc="rotation" min="-180" max="180" step="1" />
                <output>0°</output>
              </label>
              <div class="prop-row prop-row--tiny">
                <button type="button" class="chip" data-mc-btn="rot-l" aria-label="Putar 90° kiri">↺ 90°</button>
                <button type="button" class="chip" data-mc-btn="rot-r" aria-label="Putar 90° kanan">↻ 90°</button>
                <button type="button" class="chip" data-mc-btn="reset" aria-label="Reset transformasi">Reset</button>
              </div>
            </div>

            <p class="props-hint">Tarik titik sudut untuk resize • knob atas untuk putar • seret untuk pindah</p>
          </div>

          <div class="editor__photo-props" hidden>
            <div class="prop-row">
              <p class="photo-controls__title">📷 Foto <span data-pc-slot>1</span> — ukuran di lubang frame</p>
            </div>
            <label class="manual-ctrl">
              <span>Ukuran</span>
              <input type="range" data-pc="scale" min="${PHOTO_MIN_ZOOM}" max="${PHOTO_MAX_ZOOM}" step="0.01" value="1" />
              <output>100%</output>
            </label>
            <label class="manual-ctrl">
              <span>Putar</span>
              <input type="range" data-pc="rotation" min="-180" max="180" step="1" value="0" />
              <output>0°</output>
            </label>
            <div class="prop-row prop-row--tiny">
              <button type="button" class="chip" data-pc-btn="fit">Pas lagi</button>
            </div>
            <p class="props-hint">Seret foto untuk geser • titik sudut untuk zoom • knob atas untuk muter — foto tetap rapi di lubang frame</p>
          </div>

          <div class="editor__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-ed="undo" aria-label="Undo">Undo</button>
            <button type="button" class="btn btn--ghost btn--sm" data-ed="redo" aria-label="Redo">Redo</button>
            <button type="button" class="btn btn--ghost btn--sm" data-ed="reset">Reset</button>
          </div>
          <button type="button" class="btn btn--primary btn--block editor__next" data-ed="download">Lanjut ke Unduh</button>
        </div>
      </div>
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'editor__canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Kanvas editor foto');
    host.querySelector('.editor__stage')!.appendChild(this.canvas);

    // Frame/bg yang telat termuat → repaint SEKALI otomatis (tanpa kedip).
    setCanvasRepaintHook(this.canvas, () => void this.rerender());

    // Ukur area stage sekali + tiap resize — posisi kanvas akurat tanpa
    // membaca clientWidth/Height di tengah-tengah drag.
    const stageWrap = host.querySelector<HTMLElement>('.editor__stage-wrap')!;
    const measure = (): void => {
      if (this.destroyed) return;
      const w = stageWrap.clientWidth;
      const h = stageWrap.clientHeight;
      if (w === this.stageW && h === this.stageH) return;
      this.stageW = w;
      this.stageH = h;
      void this.rerender();
    };
    this.stageObs = new ResizeObserver(measure);
    this.stageObs.observe(stageWrap);
    measure();

    // Judul panel + info frame — biar panel kanan terasa "rapi", bukan dinding tombol.
    const panel = host.querySelector<HTMLElement>('.editor__panel')!;
    const panelHead = document.createElement('div');
    panelHead.className = 'editor__panel-head';
    panelHead.innerHTML = `
      <p class="editor__panel-kicker">✦ Hias fotomu</p>
      <p class="editor__panel-frame"></p>
    `;
    panelHead.querySelector<HTMLElement>('.editor__panel-frame')!.textContent =
      `${this.template.name} — ${this.session.photos.length} foto`;
    panel.prepend(panelHead);

    // Photo tabs — thumbnail asli + nomor; klik tab = foto itu tersorot.
    const tabs = host.querySelector<HTMLElement>('.editor__photos')!;
    this.session.photos.forEach((photo, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'editor__photo-tab' + (i === 0 ? ' is-active' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === 0));
      b.innerHTML = `
        <span class="editor__photo-thumb"><canvas width="64" height="48" aria-hidden="true"></canvas></span>
        <span class="editor__photo-tab-name">Foto ${i + 1}</span>
      `;
      // Gambar thumbnail dari bitmap foto (crop cover ke 64×48).
      const tc = b.querySelector<HTMLCanvasElement>('canvas');
      const tctx = tc?.getContext('2d');
      if (tctx && photo.width > 0) {
        const scale = Math.max(64 / photo.width, 48 / photo.height);
        const dw = photo.width * scale;
        const dh = photo.height * scale;
        tctx.drawImage(photo, (64 - dw) / 2, (48 - dh) / 2, dw, dh);
      }
      b.addEventListener('click', () => {
        this.activeSlot = i;
        this.activeIndex = -1;
        this.photoSelected = true;
        tabs.querySelectorAll('.editor__photo-tab').forEach((el, j) => {
          el.classList.toggle('is-active', j === i);
          el.setAttribute('aria-selected', String(j === i));
        });
        void this.rerender();
      });
      tabs.appendChild(b);
    });

    // Pen + eraser tool wiring
    const penBtn = host.querySelector<HTMLElement>('[data-tool="pen"]')!;
    const eraserBtn = host.querySelector<HTMLElement>('[data-tool="eraser"]')!;
    const colorsEl = host.querySelector<HTMLElement>('.pen-colors')!;
    const eraserSizeEl = host.querySelector<HTMLElement>('.eraser-size')!;
    const setTool = (tool: 'none' | 'pen' | 'eraser'): void => {
      this.tool = this.tool === tool ? 'none' : tool;
      penBtn.classList.toggle('is-active', this.tool === 'pen');
      penBtn.setAttribute('aria-pressed', String(this.tool === 'pen'));
      eraserBtn.classList.toggle('is-active', this.tool === 'eraser');
      eraserBtn.setAttribute('aria-pressed', String(this.tool === 'eraser'));
      colorsEl.hidden = this.tool !== 'pen';
      eraserSizeEl.hidden = this.tool !== 'eraser';
      if (this.canvas) this.canvas.style.cursor = this.tool === 'pen' ? 'crosshair' : this.tool === 'eraser' ? 'none' : 'grab';
    };
    penBtn.addEventListener('click', () => setTool('pen'));
    eraserBtn.addEventListener('click', () => setTool('eraser'));
    eraserSizeEl.querySelector<HTMLInputElement>('.eraser-size-input')!.addEventListener('input', (e) => {
      this.eraserRadius = Number((e.target as HTMLInputElement).value);
      void this.rerender();
    });
    colorsEl.querySelectorAll('.pen-color').forEach((b) =>
      b.addEventListener('click', () => {
        this.penColor = (b as HTMLElement).dataset.color ?? this.penColor;
        colorsEl.querySelectorAll('.pen-color').forEach((el) => el.classList.toggle('is-active', el === b));
      }),
    );
    colorsEl.querySelector<HTMLInputElement>('.pen-size')!.addEventListener('input', (e) => {
      this.penWidth = Number((e.target as HTMLInputElement).value);
    });

    // Stickers + emoji
    import('./StickerPicker').then(({ createStickerPicker }) => {
      if (this.destroyed) return;
      createStickerPicker(host.querySelector<HTMLElement>('.editor__stickers-slot')!, {
        onSticker: (s) => void this.addSticker(s),
        onEmoji: (char) => this.addEmoji(char),
      });
    });

    host.querySelectorAll('[data-prop]').forEach((b) =>
      b.addEventListener('click', () => this.applyProp((b as HTMLElement).dataset.prop!)),
    );
    host.querySelectorAll('[data-ed]').forEach((b) =>
      b.addEventListener('click', () => this.applyEdit((b as HTMLElement).dataset.ed!)),
    );
    this.bindPhotoControls(host);

    this.bindPointer();
    this.bindKeys();
  }

  // ---------- Manual transform controls ----------

  /** Wire the slider panel once; sliders act on whatever layer is active. */
  private bindManualControls(host: HTMLElement): void {
    const panel = host.querySelector<HTMLElement>('.manual-controls');
    if (!panel) return;
    const sliders = panel.querySelectorAll<HTMLInputElement>('input[data-mc]');

    sliders.forEach((input) => {
      input.addEventListener('pointerdown', () => {
        if (this.activeIndex >= 0) this.pushUndo();
      });
      input.addEventListener('input', () => this.applyManual(input.dataset.mc!, input.value));
    });

    panel.querySelectorAll('[data-mc-btn]').forEach((b) =>
      b.addEventListener('click', () => this.applyManualButton((b as HTMLElement).dataset.mcBtn!)),
    );
  }

  private applyManual(which: string, value: string): void {
    const l = this.active();
    if (!l) return;
    const base = this.baseDims.get(l) ?? { width: l.width, height: l.height };
    const out = this.canvas?.closest('.editor')?.querySelectorAll<HTMLElement>('.manual-ctrl');

    if (which === 'width' || which === 'height' || which === 'scale') {
      const v = Number(value);
      if (which === 'width') {
        l.width = Math.max(MIN_SIZE, base.width * v);
      } else if (which === 'height') {
        l.height = Math.max(MIN_SIZE, base.height * v);
      } else {
        l.width = Math.max(MIN_SIZE, base.width * v);
        l.height = Math.max(MIN_SIZE, base.height * v);
      }
      // Reflect current dims back into the width/height sliders.
      const wIn = this.canvas?.closest('.editor')?.querySelector<HTMLInputElement>('input[data-mc="width"]');
      const hIn = this.canvas?.closest('.editor')?.querySelector<HTMLInputElement>('input[data-mc="height"]');
      if (wIn) wIn.value = String(l.width / base.width);
      if (hIn) hIn.value = String(l.height / base.height);
    } else if (which === 'rotation') {
      l.rotation = (Number(value) * Math.PI) / 180;
    }

    // Update the numeric labels.
    if (out) {
      const wOut = out[0]?.querySelector('output');
      const hOut = out[1]?.querySelector('output');
      const sOut = out[2]?.querySelector('output');
      const rOut = out[3]?.querySelector('output');
      if (wOut) wOut.textContent = `${Math.round((l.width / base.width) * 100)}%`;
      if (hOut) hOut.textContent = `${Math.round((l.height / base.height) * 100)}%`;
      if (sOut) sOut.textContent = `${Math.round(((l.width / base.width + l.height / base.height) / 2) * 100)}%`;
      if (rOut) rOut.textContent = `${Math.round((l.rotation * 180) / Math.PI)}°`;
    }
    void this.rerender();
  }

  private applyManualButton(which: string): void {
    const l = this.active();
    if (!l) return;
    this.pushUndo();
    const base = this.baseDims.get(l) ?? { width: l.width, height: l.height };
    if (which === 'rot-l') {
      l.rotation -= Math.PI / 2;
    } else if (which === 'rot-r') {
      l.rotation += Math.PI / 2;
    } else if (which === 'reset') {
      l.width = base.width;
      l.height = base.height;
      l.rotation = 0;
    }
    // Keep sliders in sync with the new state.
    const root = this.canvas?.closest('.editor');
    const sync = (mc: string, v: number): void => {
      const input = root?.querySelector<HTMLInputElement>(`input[data-mc="${mc}"]`);
      if (input) input.value = String(v);
    };
    sync('width', l.width / base.width);
    sync('height', l.height / base.height);
    sync('scale', (l.width / base.width + l.height / base.height) / 2);
    sync('rotation', (l.rotation * 180) / Math.PI);
    void this.rerender();
  }

  /** Refresh slider positions + labels to match the currently selected layer. */
  private syncManualControls(): void {
    const root = this.canvas?.closest('.editor');
    if (!root) return;
    const panel = root.querySelector<HTMLElement>('.manual-controls');
    if (!panel) return;
    const l = this.active();
    const sliders = panel.querySelectorAll<HTMLInputElement>('input[data-mc]');
    const outputs = panel.querySelectorAll('output');
    if (!l) {
      sliders.forEach((s) => { s.value = s.dataset.mc === 'rotation' ? '0' : '1'; });
      outputs.forEach((o) => { o.textContent = o.closest('.manual-ctrl')?.querySelector('span')?.textContent === 'Putar' ? '0°' : '100%'; });
      return;
    }
    const base = this.baseDims.get(l) ?? { width: l.width, height: l.height };
    const w = l.width / base.width;
    const h = l.height / base.height;
    const set = (mc: string, v: number): void => {
      const input = panel.querySelector<HTMLInputElement>(`input[data-mc="${mc}"]`);
      if (input) input.value = String(v);
    };
    set('width', w);
    set('height', h);
    set('scale', (w + h) / 2);
    set('rotation', (l.rotation * 180) / Math.PI);
    if (outputs[0]) outputs[0].textContent = `${Math.round(w * 100)}%`;
    if (outputs[1]) outputs[1].textContent = `${Math.round(h * 100)}%`;
    if (outputs[2]) outputs[2].textContent = `${Math.round(((w + h) / 2) * 100)}%`;
    if (outputs[3]) outputs[3].textContent = `${Math.round((l.rotation * 180) / Math.PI)}°`;
  }

  // ---------- Photo controls (zoom · geser · putar di dalam lubang slot) ----------

  /** Slot photoSlots untuk tab foto yang sedang aktif (-1 kalau tidak ada). */
  private activePhotoSlotIndex(): number {
    return slotIndexOfPhoto(this.template, this.activeSlot);
  }

  /** Transformasi foto slot — objeknya dibuat saat pertama kali disentuh. */
  private tx(slotIndex: number): PhotoTransform {
    while (this.photoTransforms.length <= slotIndex) this.photoTransforms.push(undefined);
    const existing = this.photoTransforms[slotIndex];
    if (existing) return existing;
    const fresh: PhotoTransform = { scale: 1, rotation: 0, dx: 0, dy: 0 };
    this.photoTransforms[slotIndex] = fresh;
    return fresh;
  }

  /** Rect foto aktif (handle zoom/geser/putar) — null kalau foto tidak ada. */
  private activePhotoTarget(): HandleTarget | null {
    const idx = this.activePhotoSlotIndex();
    if (idx < 0) return null;
    return photoHandleTarget(this.template, idx, this.photoTransforms);
  }

  /** Klik di foto slot mana? (-1 kalau bukan foto). */
  private hitTestPhoto(p: { x: number; y: number }): number {
    const slots = this.template.engine.photoSlots;
    for (let i = slots.length - 1; i >= 0; i--) {
      const target = photoHandleTarget(this.template, i, this.photoTransforms);
      if (!target) continue;
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      const cos = Math.cos(-target.rotation);
      const sin = Math.sin(-target.rotation);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const pad = Math.max(10, Math.max(target.width, target.height) * 0.03);
      if (Math.abs(lx) <= target.width / 2 + pad && Math.abs(ly) <= target.height / 2 + pad) return i;
    }
    return -1;
  }

  private bindPhotoControls(host: HTMLElement): void {
    const panel = host.querySelector<HTMLElement>('.editor__photo-props');
    if (!panel) return;
    panel.querySelectorAll<HTMLInputElement>('input[data-pc]').forEach((input) => {
      input.addEventListener('pointerdown', () => {
        if (this.photoSelected && this.activeIndex < 0) this.pushUndo();
      });
      input.addEventListener('input', () => this.applyPhotoControl(input.dataset.pc!, input.value));
    });
    panel.querySelectorAll('[data-pc-btn]').forEach((b) =>
      b.addEventListener('click', () => {
        const idx = this.activePhotoSlotIndex();
        if (idx < 0) return;
        this.pushUndo();
        this.photoTransforms[idx] = { scale: 1, rotation: 0, dx: 0, dy: 0 };
        this.syncPhotoControls();
        void this.rerender();
        toast('Foto dikembalikan ke ukuran pas.', 'info');
      }),
    );
  }

  private applyPhotoControl(which: string, value: string): void {
    const idx = this.activePhotoSlotIndex();
    if (idx < 0) return;
    const t = this.tx(idx);
    if (which === 'scale') {
      t.scale = Math.min(PHOTO_MAX_ZOOM, Math.max(PHOTO_MIN_ZOOM, Number(value)));
    } else if (which === 'rotation') {
      t.rotation = (Number(value) * Math.PI) / 180;
    }
    this.syncPhotoControls();
    void this.rerender();
  }

  /** Sinkronkan slider panel foto dengan transformasi saat ini. */
  private syncPhotoControls(): void {
    const root = this.canvas?.closest('.editor');
    const panel = root?.querySelector<HTMLElement>('.editor__photo-props');
    if (!panel) return;
    const idx = this.activePhotoSlotIndex();
    const t = idx >= 0 ? this.photoTransforms[idx] : undefined;
    const scale = t?.scale ?? 1;
    const rotDeg = Math.round(((t?.rotation ?? 0) * 180) / Math.PI);
    const scaleInput = panel.querySelector<HTMLInputElement>('input[data-pc="scale"]');
    const rotInput = panel.querySelector<HTMLInputElement>('input[data-pc="rotation"]');
    if (scaleInput) scaleInput.value = String(scale);
    if (rotInput) rotInput.value = String(rotDeg);
    const outputs = panel.querySelectorAll('output');
    if (outputs[0]) outputs[0].textContent = `${Math.round(scale * 100)}%`;
    if (outputs[1]) outputs[1].textContent = `${rotDeg}°`;
    const slotLabel = panel.querySelector<HTMLElement>('[data-pc-slot]');
    if (slotLabel) slotLabel.textContent = String(this.activeSlot + 1);
  }

  // ---------- Layers ----------

  private async addSticker(s: StickerDef): Promise<void> {
    try {
      const img = await loadImageCached(s.image);
      if (this.destroyed) return;
      const { canvas: spec } = this.template.engine;
      const size = Math.min(spec.width, spec.height) * 0.2;
      this.pushUndo();
      this.layers.push({
        kind: 'sticker',
        id: s.id,
        image: img,
        x: spec.width / 2,
        y: spec.height / 2,
        width: size,
        height: (size * img.naturalHeight) / img.naturalWidth,
        rotation: 0,
        overFrame: true,
      });
      this.activeIndex = this.layers.length - 1;
      this.baseDims.set(this.layers[this.activeIndex]!, { width: size, height: (size * img.naturalHeight) / img.naturalWidth });
      await this.rerender();
    } catch {
      toast('Stiker gagal dimuat. Coba yang lain.', 'error');
    }
  }

  private addEmoji(char: string): void {
    const { canvas: spec } = this.template.engine;
    const size = Math.min(spec.width, spec.height) * 0.15;
    this.pushUndo();
    this.layers.push({
      kind: 'emoji',
      char,
      x: spec.width / 2,
      y: spec.height / 2,
      width: size,
      height: size,
      rotation: 0,
      overFrame: true,
    });
    this.activeIndex = this.layers.length - 1;
    this.baseDims.set(this.layers[this.activeIndex]!, { width: size, height: size });
    void this.rerender();
  }

  private active(): Layer | undefined {
    return this.layers[this.activeIndex];
  }

  private applyProp(prop: string): void {
    const l = this.active();
    if (!l) {
      toast('Pilih dulu stiker/emoji di kanvas.', 'info');
      return;
    }
    this.pushUndo();
    const i = this.activeIndex;
    switch (prop) {
      case 'bring-front': {
        const [moved] = this.layers.splice(i, 1);
        if (moved) this.layers.push(moved);
        this.activeIndex = this.layers.length - 1;
        break;
      }
      case 'send-back': {
        const [moved] = this.layers.splice(i, 1);
        if (moved) this.layers.unshift(moved);
        this.activeIndex = 0;
        break;
      }
      case 'forward': {
        // Naik satu posisi — lapisan atas digambar paling akhir = di depan.
        if (i < this.layers.length - 1) {
          const next = this.layers[i + 1]!;
          this.layers[i + 1] = this.layers[i]!;
          this.layers[i] = next;
          this.activeIndex = i + 1;
        }
        break;
      }
      case 'backward': {
        if (i > 0) {
          const prev = this.layers[i - 1]!;
          this.layers[i - 1] = this.layers[i]!;
          this.layers[i] = prev;
          this.activeIndex = i - 1;
        }
        break;
      }
      case 'toggle-frame': {
        // true (default) = di atas frame; false = di belakang frame.
        l.overFrame = l.overFrame === false;
        toast(
          l.overFrame === false ? 'Layer dipindah ke belakang frame.' : 'Layer dipindah ke depan frame.',
          'info',
        );
        break;
      }
      case 'delete':
        this.layers.splice(i, 1);
        this.activeIndex = -1;
        break;
    }
    void this.rerender();
  }

  private applyEdit(edit: string): void {
    switch (edit) {
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'reset':
        if (this.layers.length === 0 && !this.photoTransforms.some(Boolean)) return;
        this.pushUndo();
        this.layers = [];
        this.activeIndex = -1;
        this.photoTransforms = this.template.engine.photoSlots.map(() => undefined);
        this.photoSelected = false;
        void this.rerender();
        break;
      case 'download': void this.download(); break;
    }
  }

  // ---------- Undo / redo ----------

  private snapshot(): EditorSnapshot {
    return {
      layers: this.layers.map((l) => ({ ...l })),
      photos: this.photoTransforms.map((p) => (p ? { ...p } : undefined)),
    };
  }

  private restore(snap: EditorSnapshot): void {
    this.layers = snap.layers;
    this.photoTransforms = snap.photos;
    this.activeIndex = -1;
    this.photoSelected = false;
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    void this.rerender();
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    void this.rerender();
  }

  // ---------- Rendering ----------

  private async rerender(): Promise<void> {
    if (!this.canvas || this.destroyed) return;
    await this.ensureOverlayLoaded();
    if (!this.canvas || this.destroyed) return;
    const availW = this.stageW || this.stage?.parentElement?.clientWidth || 640;
    const availH = this.stageH || 900;
    const { canvas: spec } = this.template.engine;
    const cssScale = Math.min(availW / spec.width, availH / spec.height, 1);
    const cssW = `${Math.round(spec.width * cssScale)}px`;
    const cssH = `${Math.round(spec.height * cssScale)}px`;
    if (this.canvas.style.width !== cssW) this.canvas.style.width = cssW;
    if (this.canvas.style.height !== cssH) this.canvas.style.height = cssH;
    // Buffer kanvas = ukuran CSS × DPR (dibatasi 1×) — preview & garis handle
    // tampil tajam dan presisi, tetap ringan saat drag.
    const dpr = Math.min(1, Math.max(0.5, (window.devicePixelRatio || 1) * cssScale));
    renderComposite(this.canvas, this.template, this.session, this.layers, {
      interactive: true,
      activeIndex: this.activeIndex,
      activeSlot: this.activeSlot,
      activePhoto: this.photoSelected && this.activeIndex < 0,
      photoTransforms: this.photoTransforms,
      previewScale: dpr,
      eraser: this.tool === 'eraser' && this.eraserPos ? { ...this.eraserPos, radius: this.eraserRadius } : undefined,
    });
    this.updatePropsVisibility();
    this.syncManualControls();
  }

  private overlayLoadState: 'unloaded' | 'loading' | 'loaded' | 'failed' = 'unloaded';

  private async ensureOverlayLoaded(): Promise<void> {
    const overlay = this.template.engine.overlay;
    if (!overlay || this.overlayLoadState !== 'unloaded') return;
    this.overlayLoadState = 'loading';
    try {
      await loadImageCached(overlay);
      this.overlayLoadState = 'loaded';
    } catch {
      this.overlayLoadState = 'failed';
      toast('Frame template gagal dimuat — memakai layout polos.', 'error');
    }
  }

  private updatePropsVisibility(): void {
    const root = this.canvas?.closest('.editor');
    const layerPanel = root?.querySelector<HTMLElement>('.editor__props');
    const photoPanel = root?.querySelector<HTMLElement>('.editor__photo-props');
    const showPhoto = this.photoSelected && this.activeIndex < 0;
    if (layerPanel) layerPanel.hidden = this.activeIndex < 0;
    if (photoPanel) photoPanel.hidden = !showPhoto;
    this.syncFrameToggle();
    if (showPhoto) this.syncPhotoControls();
  }

  /** Status tombol "Di atas frame" mengikuti layer yang sedang dipilih. */
  private syncFrameToggle(): void {
    const root = this.canvas?.closest('.editor');
    const btn = root?.querySelector<HTMLButtonElement>('[data-prop="toggle-frame"]');
    if (!btn) return;
    const l = this.active();
    const over = l ? l.overFrame !== false : true;
    btn.setAttribute('aria-pressed', String(over));
    btn.classList.toggle('is-active', over);
    btn.textContent = over ? '🖼️ Di atas frame' : '🖼️ Di belakang frame';
  }

  // ---------- Pointer interaction ----------

  private bindPointer(): void {
    const canvas = this.canvas!;
    type Drag =
      | { mode: 'move'; index: number; startX: number; startY: number; layer: Layer }
      | { mode: 'resize'; index: number; layer: Layer }
      | { mode: 'rotate'; index: number; layer: Layer }
      | { mode: 'photo-move'; slotIndex: number; startX: number; startY: number; base: PhotoTransform }
      | { mode: 'photo-resize'; slotIndex: number; base: PhotoTransform; target: HandleTarget }
      | { mode: 'photo-rotate'; slotIndex: number; base: PhotoTransform; target: HandleTarget }
      | { mode: 'pen' }
      | { mode: 'erase' };
    let drag: Drag | null = null;

    /** Map a pointer event to template-space coordinates. */
    const toCanvasPoint = (e: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const { canvas: spec } = this.template.engine;
      return {
        x: ((e.clientX - rect.left) / rect.width) * spec.width,
        y: ((e.clientY - rect.top) / rect.height) * spec.height,
      };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const p = toCanvasPoint(e);
      canvas.setPointerCapture(e.pointerId);

      // Eraser tool: remove every ink stroke touched by the rubber circle.
      if (this.tool === 'eraser') {
        drag = { mode: 'erase' };
        this.eraseAt(p);
        return;
      }

      // Pen tool: start a stroke on the current photo.
      if (this.tool === 'pen') {
        this.pushUndo();
        const stroke: Layer = {
          kind: 'ink',
          x: 0, y: 0, width: 1, height: 1, rotation: 0,
          overFrame: true,
          data: { points: [p], color: this.penColor, width: this.penWidth },
        };
        this.currentStroke = stroke;
        this.layers.push(stroke);
        drag = { mode: 'pen' };
        void this.rerender();
        return;
      }

      // Grab handles on the active layer take priority.
      if (this.activeIndex >= 0) {
        const l = this.active();
        if (l) {
          const hit = handleHitTest(p, l);
          if (hit === 'resize') {
            this.pushUndo();
            drag = { mode: 'resize', index: this.activeIndex, layer: { ...l } };
            return;
          }
          if (hit === 'rotate') {
            this.pushUndo();
            drag = { mode: 'rotate', index: this.activeIndex, layer: { ...l } };
            return;
          }
        }
      }

      // Handle foto aktif: zoom dari titik sudut, muter dari knob atas.
      if (this.photoSelected && this.activeIndex < 0) {
        const slotIndex = this.activePhotoSlotIndex();
        const target = this.activePhotoTarget();
        if (slotIndex >= 0 && target) {
          const hit = handleHitTest(p, target);
          const base: PhotoTransform = { ...this.tx(slotIndex) };
          if (hit === 'resize') {
            this.pushUndo();
            drag = { mode: 'photo-resize', slotIndex, base, target };
            return;
          }
          if (hit === 'rotate') {
            this.pushUndo();
            drag = { mode: 'photo-rotate', slotIndex, base, target };
            return;
          }
          // Badan foto = geser.
          this.pushUndo();
          drag = { mode: 'photo-move', slotIndex, startX: p.x, startY: p.y, base };
          return;
        }
      }

      const idx = this.hitTest(p);
      if (idx >= 0) {
        this.activeIndex = idx;
        this.photoSelected = false; // memilih stiker = handle foto disembunyikan
        this.pushUndo();
        drag = { mode: 'move', index: idx, startX: p.x, startY: p.y, layer: { ...this.layers[idx]! } };
      } else {
        // Klik area kosong: coba pilih foto di bawahnya, kalau bukan foto — lepas.
        const slotIdx = this.hitTestPhoto(p);
        if (slotIdx >= 0) {
          this.activeIndex = -1;
          this.photoSelected = true;
          this.activeSlot = this.template.engine.photoSlots[slotIdx]!.photoIndex;
          const root = this.canvas?.closest('.editor');
          root?.querySelectorAll<HTMLElement>('.editor__photo-tab').forEach((el, j) => {
            el.classList.toggle('is-active', j === this.activeSlot);
            el.setAttribute('aria-selected', String(j === this.activeSlot));
          });
        } else {
          this.activeIndex = -1;
          this.photoSelected = false;
        }
        drag = null;
      }
      this.updatePropsVisibility();
      void this.rerender();
    });      canvas.addEventListener('pointermove', (e) => {
      const p = toCanvasPoint(e);

      // Eraser hover preview: track the rubber circle while the tool is active.
      if (this.tool === 'eraser') {
        this.eraserPos = p;
        if (this.eraserRaf === 0) {
          this.eraserRaf = requestAnimationFrame(() => {
            this.eraserRaf = 0;
            void this.rerender();
          });
        }
      }

      if (!drag) return;
      if (drag.mode === 'erase') {
        this.eraseAt(p);
        return;
      }
      if (drag.mode === 'pen') {
        const stroke = this.currentStroke;
        if (stroke && stroke.kind === 'ink') stroke.data.points.push(p);
        void this.rerender();
        return;
      }
      if (drag.mode === 'photo-move') {
        const t = this.tx(drag.slotIndex);
        t.dx = drag.base.dx + (p.x - drag.startX);
        t.dy = drag.base.dy + (p.y - drag.startY);
        void this.rerender();
        return;
      }
      if (drag.mode === 'photo-resize') {
        // Zoom seragam: rasio jarak titik sudut terhadap lubang slot.
        const slot = this.template.engine.photoSlots[drag.slotIndex];
        const t = this.tx(drag.slotIndex);
        if (slot) {
          const base = drag.target;
          const dx = p.x - base.x;
          const dy = p.y - base.y;
          const cos = Math.cos(-base.rotation);
          const sin = Math.sin(-base.rotation);
          const lx = dx * cos - dy * sin;
          const ly = dx * sin + dy * cos;
          const sx = Math.abs(lx) / Math.max(1, slot.width / 2);
          const sy = Math.abs(ly) / Math.max(1, slot.height / 2);
          t.scale = Math.min(PHOTO_MAX_ZOOM, Math.max(PHOTO_MIN_ZOOM, (sx + sy) / 2));
        }
        void this.rerender();
        return;
      }
      if (drag.mode === 'photo-rotate') {
        const t = this.tx(drag.slotIndex);
        t.rotation = Math.atan2(p.y - drag.target.y, p.x - drag.target.x) + Math.PI / 2;
        void this.rerender();
        return;
      }
      const l = this.layers[drag.index];
      if (!l) return;
      if (drag.mode === 'move') {
        l.x = drag.layer.x + (p.x - drag.startX);
        l.y = drag.layer.y + (p.y - drag.startY);
      } else if (drag.mode === 'resize') {
        // Independent width/height stretch from the grabbed corner.
        const base = drag.layer;
        const cos = Math.cos(base.rotation);
        const sin = Math.sin(base.rotation);
        const dx = p.x - base.x;
        const dy = p.y - base.y;
        const lx = dx * cos + dy * sin;  // local x (right)
        const ly = -dx * sin + dy * cos; // local y (down)
        const sx = base.width >= 0 ? 1 : -1;
        l.width = Math.max(MIN_SIZE, Math.abs(lx) * 2) * sx;
        l.height = Math.max(MIN_SIZE, Math.abs(ly) * 2) * sx;
      } else if (drag.mode === 'rotate') {
        l.rotation = Math.atan2(p.y - drag.layer.y, p.x - drag.layer.x) + Math.PI / 2;
      }
      void this.rerender();
    });

    const endDrag = (): void => {
      if (drag?.mode === 'pen') this.currentStroke = null;
      drag = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Hide the rubber-circle preview when the pointer leaves the canvas.
    canvas.addEventListener('pointerleave', () => {
      if (this.tool === 'eraser') {
        this.eraserPos = null;
        void this.rerender();
      }
    });
  }

  /**
   * Eraser: remove every ink stroke whose path passes within eraserRadius
   * of p (template-space px). One undo entry per removed stroke.
   */
  private eraseAt(p: { x: number; y: number }): void {
    const r = this.eraserRadius;
    let removed = false;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i]!;
      if (l.kind !== 'ink') continue;
      const pts = l.data.points as { x: number; y: number }[];
      let hit = false;
      for (let j = 0; j < pts.length && !hit; j++) {
        const q = pts[j]!;
        if (Math.hypot(q.x - p.x, q.y - p.y) <= r) {
          hit = true;
        } else if (j > 0) {
          // distance point → segment (q_prev → q)
          const a = pts[j - 1]!;
          const dx = q.x - a.x;
          const dy = q.y - a.y;
          const lenSq = dx * dx + dy * dy;
          const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
          if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= r) hit = true;
        }
      }
      if (!hit) continue;
      if (!removed) {
        this.pushUndo();
        removed = true;
      }
      this.layers.splice(i, 1);
      if (this.activeIndex === i) this.activeIndex = -1;
      else if (this.activeIndex > i) this.activeIndex -= 1;
    }
    if (removed) void this.rerender();
  }

  private hitTest(p: { x: number; y: number }): number {
    // Layer di atas frame diprioritaskan (mereka yang terlihat mata), baru
    // layer di belakang frame — di dalam tiap grup tetap dari atas ke bawah.
    const over: number[] = [];
    const under: number[] = [];
    this.layers.forEach((l, idx) => {
      if (l.overFrame === false) under.push(idx);
      else over.push(idx);
    });
    for (const idx of [...over.reverse(), ...under.reverse()]) {
      const l = this.layers[idx]!;
      if (l.kind === 'ink') continue; // ink is not grabbable
      const dx = p.x - l.x;
      const dy = p.y - l.y;
      const cos = Math.cos(-l.rotation);
      const sin = Math.sin(-l.rotation);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      // generous touch slop
      const pad = Math.max(12, Math.max(l.width, l.height) * 0.04);
      if (Math.abs(lx) <= l.width / 2 + pad && Math.abs(ly) <= l.height / 2 + pad) return idx;
    }
    return -1;
  }

  private bindKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      const l = this.active();
      if (!l) return;
      const step = e.shiftKey ? 20 : 6;
      switch (e.key) {
        case 'ArrowLeft': l.x -= step; e.preventDefault(); break;
        case 'ArrowRight': l.x += step; e.preventDefault(); break;
        case 'ArrowUp': l.y -= step; e.preventDefault(); break;
        case 'ArrowDown': l.y += step; e.preventDefault(); break;
        case 'Delete': case 'Backspace':
          this.layers.splice(this.activeIndex, 1);
          this.activeIndex = -1;
          e.preventDefault();
          break;
        default: return;
      }
      void this.rerender();
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  // ---------- Export ----------

  /**
   * Freeze the composite and hand it to #/download (spec §5.4).
   * Layers are drafted too so "Edit Ulang" restores every sticker/text/pen stroke.
   */
  private async download(): Promise<void> {
    try {
      await this.ensureOverlayLoaded();
      const final = renderFinal(this.template, this.session, this.layers, this.photoTransforms);
      saveDraftLayers(this.session.id, this.layers, this.photoTransforms);
      setPendingExport({
        canvas: final,
        templateId: this.template.id,
        templateName: this.template.name,
        sessionId: this.session.id,
        createdAt: Date.now(),
      });
      this.onFinished();
      navigate('/download');
    } catch {
      toast('Gagal menyiapkan hasil. Coba lagi.', 'error');
    }
  }

  private get stage(): HTMLElement | null {
    return this.canvas?.parentElement ?? null;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.eraserRaf) cancelAnimationFrame(this.eraserRaf);
    if (this.stageObs) this.stageObs.disconnect();
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
  }
}
