import type { Layer, PhotoTransform, Session, TemplateDef } from '../types';

/** Small image cache so the editor and renderer share decoded sprites. */
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Hook repaint per kanvas: kalau overlay frame/background ternyata belum
 * termuat saat kanvas digambar, gambar ulang SEKALI begitu gambarnya siap.
 * Hasilnya: frame selalu tampil utuh — akurat, tanpa telat, tanpa kedip.
 */
const repaintHooks = new WeakMap<HTMLCanvasElement, () => void>();

export function setCanvasRepaintHook(canvas: HTMLCanvasElement, fn: () => void): void {
  repaintHooks.set(canvas, fn);
}

function repaintCanvas(canvas: HTMLCanvasElement): void {
  requestAnimationFrame(() => repaintHooks.get(canvas)?.());
}

export function loadImageCached(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface FittedStyle {
  /** Rotasi foto di dalam slot, radian. */
  rotation?: number;
  /** Zoom tambahan (1 = sesuai hitungan fit biasa). */
  scale?: number;
}

/**
 * Draw a bitmap into a slot rect. cover = fill + crop, contain = letterbox.
 * `style` merotasi/memperbesar foto di dalam slot — biar foto miring ala
 * tempelan tetap menutup lubang frame (zoom otomatis mengikuti sudut).
 */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain',
  style: FittedStyle = {},
): void {
  const bw = bitmap.width;
  const bh = bitmap.height;
  if (bw === 0 || bh === 0) return;
  const rotation = style.rotation ?? 0;
  // Cover tidak boleh zoom-out — nanti ada celah kosong di lubang frame.
  const zoom = fit === 'cover'
    ? Math.max(1, style.scale && style.scale > 0 ? style.scale : 1)
    : style.scale && style.scale > 0 ? style.scale : 1;

  if (rotation === 0 && zoom === 1) {
    const base = fit === 'cover' ? Math.max(w / bw, h / bh) : Math.min(w / bw, h / bh);
    const dw = bw * base;
    const dh = bh * base;
    ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }

  const base = fit === 'cover' ? Math.max(w / bw, h / bh) : Math.min(w / bw, h / bh);
  let dw = bw * base * zoom;
  let dh = bh * base * zoom;

  // Foto miring harus tetap menutup seluruh lubang slot — DIHITUNG EKSAK:
  // bounding box gambar dw×dh yang dirotasi θ adalah (dw·c + dh·s)×(dw·s + dh·c);
  // syarat minimal menutup kotak w×h (zoom terkecil yang TANPA celah):
  //   k ≥ w / (bw·c + bh·s)   dan   k ≥ h / (bw·s + bh·c)
  if (rotation !== 0 && fit === 'cover') {
    const c = Math.abs(Math.cos(rotation));
    const s = Math.abs(Math.sin(rotation));
    const k = Math.max(
      w / (bw * c + bh * s),
      h / (bw * s + bh * c),
    );
    dw = Math.max(dw, bw * k);
    dh = Math.max(dh, bh * k);
  }

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, template: TemplateDef, canvas?: HTMLCanvasElement): void {
  // PENTING: jangan shadow parameter `canvas` (elemen kanvas) dengan `canvas`
  // spesifikasi template — dulu hook repaint dapat objek spesifikasi, jadi
  // background yang telat termuat tidak pernah digambar ulang (cacat lama).
  const { canvas: spec, background } = template.engine;
  const bgIsColor = !/\.(png|jpe?g|svg|webp|gif)$/i.test(background) && !background.startsWith('/');
  if (bgIsColor) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, spec.width, spec.height);
  } else {
    const img = imageCache.get(background);
    if (img) {
      ctx.drawImage(img, 0, 0, spec.width, spec.height);
    } else {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, spec.width, spec.height);
      // Background belum siap? Muat lalu gambar ulang kanvasnya SEKALI — dan
      // hanya kalau gambarnya BENAR-BENAR berhasil dimuat (gagal = berhenti,
      // tidak ada repaint loop tanpa henti).
      if (canvas) {
        const el = canvas;
        void loadImageCached(background)
          .then(() => repaintCanvas(el))
          .catch(() => undefined);
      }
    }
  }
}

/** Gabungan settingan foto frame: per-slot menimpa photoStyle bawaan frame. */
function slotStyle(
  template: TemplateDef,
  slot: { rotation?: number; scale?: number },
): FittedStyle {
  const style = template.engine.photoStyle;
  const rotation = slot.rotation ?? style?.rotation ?? 0;
  const scale = slot.scale ?? style?.scale ?? 1;
  return {
    rotation: (rotation * Math.PI) / 180,
    scale,
  };
}

function drawDecals(ctx: CanvasRenderingContext2D, template: TemplateDef): void {
  const decals = template.engine.decals ?? [];
  for (const d of decals) {
    ctx.save();
    ctx.fillStyle = d.color;
    ctx.textAlign = d.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = d.font || `${d.size}px sans-serif`;
    ctx.fillText(d.text, d.x, d.y);
    ctx.restore();
  }
}

/**
 * Preload semua aset gambar sebuah template (overlay frame + background)
 * SEBELUM kanvas pertama digambar — supaya frame tampil utuh pada paint
 * pertama: tanpa kedip, tanpa telat, tanpa repaint di tengah animasi.
 */
export async function preloadTemplateAssets(template: TemplateDef): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  const overlay = template.engine.overlay;
  if (overlay) jobs.push(loadImageCached(overlay).catch(() => undefined));
  const { background } = template.engine;
  if (background && /\.(png|jpe?g|svg|webp|gif)$/i.test(background)) {
    jobs.push(loadImageCached(background).catch(() => undefined));
  }
  await Promise.all(jobs);
}

/** Draw one editor layer (sticker/emoji) with its transform. */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, scale: number): void {
  ctx.save();
  ctx.translate(layer.x * scale, layer.y * scale);
  ctx.rotate(layer.rotation);
  ctx.translate((-layer.width / 2) * scale, (-layer.height / 2) * scale);
  const w = layer.width * scale;
  const h = layer.height * scale;
  if (layer.kind === 'sticker') {
    ctx.drawImage(layer.image, 0, 0, w, h);
  } else if (layer.kind === 'emoji') {
    ctx.font = `${h}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.char, w / 2, h / 2 + h * 0.04);
  }
  ctx.restore();
}

/** Sebuah persegi yang bisa dipegang — dipakai handle layer & handle foto. */
export interface HandleTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Posisi foto user di dalam lubang slot: pusat digeser (dx/dy), ukuran
 * dikalikan scale, lalu dirotasi — hasilnya tetap ter-clip ke lubang slot.
 */
export function photoHandleTarget(
  template: TemplateDef,
  slotIndex: number,
  transforms?: (PhotoTransform | undefined)[],
): HandleTarget | null {
  const slot = template.engine.photoSlots[slotIndex];
  if (!slot) return null;
  const t = transforms?.[slotIndex];
  return {
    x: slot.x + slot.width / 2 + (t?.dx ?? 0),
    y: slot.y + slot.height / 2 + (t?.dy ?? 0),
    width: slot.width * (t?.scale ?? 1),
    height: slot.height * (t?.scale ?? 1),
    rotation: t?.rotation ?? 0,
  };
}

/** Index slot di photoSlots untuk sebuah photoIndex (foto 1/2/3…). */
export function slotIndexOfPhoto(template: TemplateDef, photoIndex: number): number {
  return template.engine.photoSlots.findIndex((sp) => sp.photoIndex === photoIndex);
}

/**
 * Gambar semua foto ke slotnya — foto sudah "pulang" ke lubang frame
 * berkat ctx.clip, jadi zoom/geser/putar dari editor aman di dalam bingkai.
 */
function drawPhotoSlots(
  ctx: CanvasRenderingContext2D,
  template: TemplateDef,
  session: Session,
  transforms?: (PhotoTransform | undefined)[],
): void {
  template.engine.photoSlots.forEach((slot, idx) => {
    const photo = session.photos[slot.photoIndex];
    if (!photo) return;
    const t = transforms?.[idx];
    ctx.save();
    roundRect(ctx, slot.x, slot.y, slot.width, slot.height, 8);
    ctx.clip();
    if (t && (t.dx !== 0 || t.dy !== 0 || t.rotation !== 0 || t.scale !== 1)) {
      const cx = slot.x + slot.width / 2;
      const cy = slot.y + slot.height / 2;
      ctx.translate(cx + t.dx, cy + t.dy);
      ctx.rotate(t.rotation);
      ctx.scale(t.scale, t.scale);
      ctx.translate(-cx, -cy);
    }
    drawFitted(
      ctx,
      photo,
      slot.x,
      slot.y,
      slot.width,
      slot.height,
      slot.fit ?? 'cover',
      slotStyle(template, slot),
    );
    ctx.restore();
  });
}

/** Draw freehand ink strokes stored in a layer's data field. */
export function drawInk(ctx: CanvasRenderingContext2D, layer: Layer, scale: number): void {
  if (layer.kind !== 'ink') return;
  const pts = layer.data.points as { x: number; y: number }[];
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.translate(layer.x * scale, layer.y * scale);
  ctx.rotate(layer.rotation);
  ctx.scale(layer.width * scale, layer.height * scale);
  ctx.strokeStyle = layer.data.color as string;
  ctx.lineWidth = (layer.data.width as number) / Math.max(layer.width, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
  ctx.restore();
}

export interface RenderOptions {
  interactive?: boolean;
  activeIndex?: number;
  previewScale?: number;
  activeSlot?: number;
  /** Foto yang sedang disorot tab/klik — handle zoom/geser/putar tampil. */
  activePhoto?: boolean;
  /** Transformasi foto per indeks slot (buat editor & render final). */
  photoTransforms?: (PhotoTransform | undefined)[];
  /** Eraser hover preview: rubber circle showing what would be erased. */
  eraser?: { x: number; y: number; radius: number };
}

/**
 * Render template + photos + editor layers. Used live (half-res preview,
 * handles) and as the base for the final render (full res, no handles).
 *
 * Urutan lapisan: background → foto → layer DI BELAKANG frame →
 * decals + frame overlay → layer DI ATAS frame → handle → kotak slot.
 * Posisi tiap layer terhadap frame ditentukan `layer.overFrame`.
 */
export function renderComposite(
  canvas: HTMLCanvasElement,
  template: TemplateDef,
  session: Session,
  layers: Layer[],
  opts: RenderOptions = {},
): void {
  const { canvas: spec, photoSlots, overlay } = template.engine;
  const s = opts.previewScale ?? 1;
  if (canvas.width !== Math.round(spec.width * s)) canvas.width = Math.round(spec.width * s);
  if (canvas.height !== Math.round(spec.height * s)) canvas.height = Math.round(spec.height * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Transform PRESISI: skala dihitung dari ukuran buffer kanvas yang benar
  // (bukan skala semula yang sudah di-round) — posisi preview cocok 1:1
  // dengan render akhir, tidak meleset sub-piksel walau canvas.width bulat.
  ctx.setTransform(canvas.width / spec.width, 0, 0, canvas.height / spec.height, 0, 0);

  drawBackground(ctx, template, canvas);

  // 1. Photos in their slots (rotasi + zoom mengikuti settingan frame,
  //    ditambah transformasi foto buatan user — selalu di-clip lubangnya).
  drawPhotoSlots(ctx, template, session, opts.photoTransforms);

  // 2a. User layers BELOW the frame overlay (overFrame === false).
  const underLayers: Layer[] = [];
  const overLayers: Layer[] = [];
  for (const layer of layers) (layer.overFrame === false ? underLayers : overLayers).push(layer);

  for (const layer of underLayers) {
    if (layer.kind === 'ink') drawInk(ctx, layer, 1);
    else drawLayer(ctx, layer, 1);
  }

  // Eraser rubber-circle preview (on top of ink, under the overlay frame).
  if (opts.eraser) {
    ctx.save();
    ctx.strokeStyle = '#ff2d7a';
    ctx.fillStyle = 'rgba(255, 45, 122, 0.12)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(opts.eraser.x, opts.eraser.y, Math.max(4, opts.eraser.radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 3. Template decals + frame overlay.
  drawDecals(ctx, template);
  if (overlay) {
    const img = imageCache.get(overlay);
    if (img) {
      ctx.drawImage(img, 0, 0, spec.width, spec.height);
    } else {
      // Frame belum termuat: muat lalu paksa repaint SEKALI — hanya jika
      // berhasil (gagal = jangan repaint, biar tidak loop percuma).
      const el = canvas;
      void loadImageCached(overlay)
        .then(() => repaintCanvas(el))
        .catch(() => undefined);
    }
  }

  // Dashed outline around the photo being edited — DIGAMBAR DI ATAS frame
  // overlay supaya sorotan slot tidak pernah tertutup bingkai (cacat lama).
  if (opts.interactive && opts.activeSlot !== undefined && opts.activePhoto) {
    const slot = photoSlots.find((sp) => sp.photoIndex === opts.activeSlot);
    if (slot) {
      ctx.save();
      ctx.strokeStyle = '#1f6feb';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      roundRect(ctx, slot.x - 6, slot.y - 6, slot.width + 12, slot.height + 12, 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3b. User layers ABOVE the frame overlay (default: di atas frame).
  for (const layer of overLayers) {
    if (layer.kind === 'ink') drawInk(ctx, layer, 1);
    else drawLayer(ctx, layer, 1);
  }

  // 3c. Handle layer aktif / foto aktif — selalu digambar paling atas
  //     supaya tetap terlihat walau stikernya ada di belakang frame.
  const active = opts.activeIndex !== undefined ? layers[opts.activeIndex] : undefined;
  if (opts.interactive && active) drawHandles(ctx, active);

  if (opts.interactive && opts.activePhoto && opts.activeSlot !== undefined) {
    const target = photoHandleTarget(template, slotIndexOfPhoto(template, opts.activeSlot), opts.photoTransforms);
    if (target) {
      ctx.save();
      ctx.strokeStyle = '#ff5d9e';
      ctx.lineWidth = Math.max(3, Math.min(target.width, target.height) * 0.012);
      ctx.setLineDash([12, 8]);
      ctx.translate(target.x, target.y);
      ctx.rotate(target.rotation);
      roundRect(ctx, -target.width / 2, -target.height / 2, target.width, target.height, 8);
      ctx.stroke();
      ctx.restore();
      drawHandles(ctx, target, '#ff5d9e');
    }
  }

}

/**
 * Draw transform handles: dashed box, corner resize dots, and a rotate
 * handle above the top edge. Coordinates are in template space.
 * `color` dipakai handle foto (pink) — default biru ala stiker.
 */
export function drawHandles(ctx: CanvasRenderingContext2D, layer: HandleTarget, color = '#1f6feb'): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate(layer.rotation);
  const w = layer.width;
  const h = layer.height;
  const hs = Math.max(w, h) * 0.03; // handle size scales with the layer

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, hs * 0.12);
  ctx.setLineDash([10, 7]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);

  // corner resize dots
  ctx.fillStyle = color;
  for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, hs * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // rotate handle: stem + knob above top-center
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, -h / 2 - hs * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -h / 2 - hs * 1.9, hs * 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Hit-test names for the handle areas of the active layer. */
export function handleHitTest(p: { x: number; y: number }, layer: HandleTarget): 'resize' | 'rotate' | 'body' | null {
  const dx = p.x - layer.x;
  const dy = p.y - layer.y;
  const cos = Math.cos(-layer.rotation);
  const sin = Math.sin(-layer.rotation);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const w = layer.width;
  const h = layer.height;
  const hs = Math.max(w, h) * 0.03;

  if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return 'body';
  // rotate knob zone (circle above top edge)
  const ry = -h / 2 - hs * 1.9;
  if (Math.hypot(lx - 0, ly - ry) <= hs * 1.4) return 'rotate';
  // corner resize zones (generous for fingers)
  const rZone = hs * 1.6;
  if (Math.abs(Math.abs(lx) - w / 2) <= rZone && Math.abs(Math.abs(ly) - h / 2) <= rZone) return 'resize';
  return null;
}

/** Render the final downloadable image (no handles, full resolution). */
export function renderFinal(
  template: TemplateDef,
  session: Session,
  layers: Layer[],
  photoTransforms?: (PhotoTransform | undefined)[],
): HTMLCanvasElement {
  const { canvas: spec } = template.engine;
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawBackground(ctx, template, canvas);
    drawPhotoSlots(ctx, template, session, photoTransforms);
    // Layer di belakang frame dulu…
    for (const layer of layers) {
      if (layer.overFrame !== false) continue;
      if (layer.kind === 'ink') drawInk(ctx, layer, 1);
      else drawLayer(ctx, layer, 1);
    }
    drawDecals(ctx, template);
    if (template.engine.overlay) {
      const img = imageCache.get(template.engine.overlay);
      if (img) ctx.drawImage(img, 0, 0, spec.width, spec.height);
    }
    // …baru layer di atas frame (urutan antar layer tetap terjaga).
    for (const layer of layers) {
      if (layer.overFrame === false) continue;
      if (layer.kind === 'ink') drawInk(ctx, layer, 1);
      else drawLayer(ctx, layer, 1);
    }
  }
  return canvas;
}
