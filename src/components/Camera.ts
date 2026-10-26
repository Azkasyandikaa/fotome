import { startCamera, stopCamera, grabFrame, CameraUnavailableError } from '../services/camera';
import { getFilters, getFilter } from '../services/template';
import { loadImageCached } from '../services/canvas';
import { runCountdown } from './Countdown';
import { toast } from './toast';
import { store, saveFilterPref, saveMirrorPref, saveDockPref, normalizePhotoCount } from '../app/state';

export interface CameraOptions {
  /** Called after each photo is taken (index 0–2) so the strip can update. */
  onShot: (index: number, photo: ImageBitmap) => void;
  /** Camera popped photo[index] itself — drop the matching slot / reset. */
  onRetakeOne: (index: number) => void;
  /** Start the whole session over. */
  onRetakeAll: () => void;
  /** Called when the user confirms the 3 photos. */
  onComplete: (photos: ImageBitmap[]) => void;
}

type ResumeAction = 'next' | 'retake' | 'restart' | 'confirm';

const THUMB_W = 56;
const THUMB_H = 44;
const TIMER_CHOICES = [3, 5, 10];

/** Draw a filter overlay image over a canvas (used by thumbnails + baking). */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  fit: 'cover' | 'contain',
): void {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Camera stage: clean video preview with a floating filter dock (chips carry
 * a live-filtered thumbnail so every effect is visible), a big round shutter,
 * and a session-based capture flow: every press of the shutter = one photo
 * session (countdown → shot), then the flow BREAKS — user reviews the shot
 * and picks ULANGI FOTO or LANJUT FOTO, with a final review at the end.
 */
export class Camera {
  private host: HTMLElement;
  private video: HTMLVideoElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private mirror = store.get('mirrorEnabled');
  private timerSecs: number | 'off' = 3;
  private dockCollapsed = store.get('dockCollapsed');
  private capturing = false;
  /** True saat jeda antar sesi jepretan — tombol bulat berfungsi sebagai LANJUT. */
  private breaking = false;
  private stopped = false;
  private opts: CameraOptions;
  private photos: ImageBitmap[] = [];
  /** Jumlah foto sesi ini (Home → Pengaturan, default 3). */
  private readonly shots = normalizePhotoCount(store.get('photoCount'));
  private statusEl: HTMLElement | null = null;
  /** Bumped to invalidate stale thumbnail paints (camera switch / destroy). */
  private thumbsToken = 0;
  /** Resolver for the current pause; null while running freely. */
  private resumeAction: ((a: ResumeAction) => void) | null = null;

  constructor(host: HTMLElement, opts: CameraOptions) {
    this.host = host;
    this.opts = opts;
    this.render();
    void this.start();
  }

  private render(): void {
    this.host.innerHTML = `
      <div class="camera">
        <div class="camera__stage">
          <video class="camera__video" autoplay playsinline muted></video>
          <div class="camera__overlay" aria-hidden="true"></div>
          <span class="camera__brand" aria-hidden="true">fotome <i>✦</i></span>
          <div class="camera__topbar">
            <span class="camera__shot-label" aria-live="polite"></span>
            <span class="camera__dots" aria-hidden="true">${Array.from({ length: this.shots }, () => '<i></i>').join('')}</span>
          </div>
          <div class="camera__status" hidden>
            <p class="camera__status-msg"></p>
            <button type="button" class="btn btn--sm" data-act="retry">Coba lagi</button>
          </div>
        </div>
        <div class="camera__dock">
          <div class="camera__dock-bar">
            <span class="camera__dock-title">FILTER</span>
            <button type="button" class="camera__dock-toggle" data-act="dock" aria-expanded="true" aria-label="Lipat panel filter" title="Lipat panel filter">⌃</button>
          </div>
          <div class="camera__filters" role="group" aria-label="Filter foto"></div>
          <div class="camera__timers" role="group" aria-label="Timer countdown">
            <span class="camera__timers-label">⏱ Timer</span>
            ${TIMER_CHOICES.map(
              (s) => `<button type="button" class="chip camera__timer${s === 3 ? ' is-active' : ''}" data-timer="${s}">${s}s</button>`,
            ).join('')}
            <button type="button" class="chip camera__timer-off" data-timer="off">Tanpa timer</button>
          </div>
        </div>
        <div class="camera__controls">
          <div class="camera__controls-side">
            <button type="button" class="camera__side-btn" data-act="retake-shot" aria-label="Ulangi foto ini" title="Ulangi foto ini" hidden>↺</button>
            <button type="button" class="camera__side-btn" data-act="mirror" aria-label="Mode cermin" aria-pressed="true" title="Mode cermin">⇋</button>
            <button type="button" class="camera__side-btn camera__side-btn--timer" data-act="timer" aria-label="Timer countdown" aria-pressed="false" title="Timer countdown">⏱</button>
          </div>
          <button type="button" class="camera__shutter" data-act="capture" aria-label="Ambil satu foto"><span></span></button>
          <div class="camera__controls-side camera__controls-side--end">
            <button type="button" class="camera__side-btn" data-act="dock" aria-label="Panel filter" title="Panel filter">🎛</button>
          </div>
        </div>
        <div class="camera__review" hidden>
          <button type="button" class="btn btn--ghost" data-act="retake-all">MULAI ULANG</button>
          <button type="button" class="btn btn--primary" data-act="confirm">LANJUT EDIT</button>
        </div>
      </div>
    `;
    this.video = this.host.querySelector('.camera__video');
    this.overlayEl = this.host.querySelector('.camera__overlay');
    this.statusEl = this.host.querySelector('.camera__status');
    this.buildFilterDock();

    // Saat break antar sesi, tombol bulat yang sama berfungsi sebagai LANJUT.
    this.host.querySelector('[data-act="capture"]')?.addEventListener('click', () => {
      if (this.breaking) {
        this.resumeWith('next');
        return;
      }
      void this.captureSequence();
    });
    this.host.querySelector('[data-act="retake-shot"]')?.addEventListener('click', () => this.resumeWith('retake'));
    this.host.querySelector('[data-act="mirror"]')?.addEventListener('click', (e) => {
      this.mirror = !this.mirror;
      const b = e.currentTarget as HTMLElement;
      b.setAttribute('aria-pressed', String(this.mirror));
      saveMirrorPref(this.mirror);
      this.applyMirror();
    });
    this.host.querySelector('[data-act="timer"]')?.addEventListener('click', () => {
      const dock = this.host.querySelector<HTMLElement>('.camera__timers');
      if (!dock) return;
      dock.hidden = !dock.hidden;
      this.host.querySelector<HTMLElement>('[data-act="timer"]')?.setAttribute('aria-pressed', String(!dock.hidden));
      if (!dock.hidden) this.setDockCollapsed(false); // opening timers unfolds the panel
    });
    // Baris timer tampil bawaan — tombol ⏱ hanya menyembunyikan/menampilkan.
    this.host.querySelector('[data-act="timer"]')?.setAttribute('aria-pressed', 'true');
    // Both the panel handle (⌃) and the 🎛 control fold/unfold the filter panel.
    this.host.querySelectorAll('[data-act="dock"]').forEach((b) =>
      b.addEventListener('click', () => this.setDockCollapsed(!this.dockCollapsed)),
    );
    this.host.querySelector('[data-act="mirror"]')?.setAttribute('aria-pressed', String(this.mirror));
    this.applyMirror(); // mirror state dari pref — jangan nunggu kamera nyala
    this.applyDockPref();
    this.host.querySelectorAll<HTMLButtonElement>('.camera__timers [data-timer]').forEach((b) => {
      b.addEventListener('click', () => {
        const raw = b.dataset.timer ?? '3';
        this.timerSecs = raw === 'off' ? 'off' : Number(raw);
        this.host.querySelectorAll<HTMLButtonElement>('.camera__timers [data-timer]').forEach((x) => {
          x.classList.toggle('is-active', x === b);
        });
      });
    });
    void this.applyFilterOverlay();
    this.host.querySelector('[data-act="retry"]')?.addEventListener('click', () => void this.start());
    this.host.querySelector('[data-act="retake-all"]')?.addEventListener('click', () => this.resumeWith('restart'));
    this.host.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      this.resumeWith('confirm');
      this.confirm();
    });
  }

  /** Filter chips with a live thumbnail so every effect is actually visible. */
  private buildFilterDock(): void {
    const filtersEl = this.host.querySelector<HTMLElement>('.camera__filters')!;
    const currentId = store.get('selectedFilterId');
    filtersEl.replaceChildren(
      ...getFilters().map((f) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip chip--filter' + (f.id === currentId ? ' is-active' : '');
        btn.dataset.filterId = f.id;
        btn.setAttribute('aria-pressed', String(f.id === currentId));

        // Drop-in filter with a custom thumb image -> <img> chip instead of canvas.
        if (f.thumb) {
          const img = document.createElement('img');
          img.className = 'chip--filter__thumb';
          img.src = f.thumb;
          img.alt = '';
          const name = document.createElement('span');
          name.className = 'chip--filter__name';
          name.textContent = f.name;
          btn.append(img, name);
          btn.classList.add('chip--filter--overlay');
        } else {
          const thumb = document.createElement('canvas');
          thumb.className = 'chip--filter__thumb';
          thumb.width = THUMB_W;
          thumb.height = THUMB_H;
          const name = document.createElement('span');
          name.className = 'chip--filter__name';
          name.textContent = f.name;
          btn.append(thumb, name);
        }

        btn.addEventListener('click', () => {
          saveFilterPref(f.id);
          void this.applyFilter();
          filtersEl.querySelectorAll('.chip--filter').forEach((el) => {
            el.classList.toggle('is-active', el === btn);
            el.setAttribute('aria-pressed', String(el === btn));
          });
        });
        return btn;
      }),
    );
  }

  /** Show the current filter's overlay PNG on top of the video preview. */
  private async applyFilterOverlay(): Promise<void> {
    if (!this.overlayEl) return;
    const f = getFilter(store.get('selectedFilterId'));
    if (!f.overlay) {
      this.overlayEl.style.backgroundImage = '';
      return;
    }
    try {
      await loadImageCached(f.overlay);
    } catch {
      return;
    }
    if (this.stopped || getFilter(store.get('selectedFilterId')).overlay !== f.overlay) return;
    this.overlayEl.style.backgroundImage = `url("${f.overlay}")`;
    this.overlayEl.style.backgroundSize = f.fit === 'contain' ? 'contain' : 'cover';
    this.overlayEl.style.backgroundPosition = 'center';
    this.overlayEl.style.backgroundRepeat = 'no-repeat';
  }

  /** Paint each chip's thumbnail from the current frame + its filter. */
  private async paintFilterThumbs(): Promise<void> {
    const token = ++this.thumbsToken;
    if (!this.video) return;
    // Load every drop-in overlay once; reused for thumbnails and baking.
    await Promise.all(
      getFilters()
        .filter((f) => !!f.overlay)
        .map((f) => loadImageCached(f.overlay!).catch(() => undefined)),
    );
    if (token !== this.thumbsToken || this.stopped) return;
    if (this.video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const done = (): void => resolve();
        this.video!.addEventListener('loadeddata', done, { once: true });
        window.setTimeout(done, 2500);
      });
    }
    if (token !== this.thumbsToken || this.stopped || !this.video) return;

    let base: ImageBitmap | null = null;
    try {
      base = await grabFrame(this.video, this.mirror);
    } catch {
      return;
    }
    if (!base || token !== this.thumbsToken) {
      base?.close();
      return;
    }

    for (const btn of this.host.querySelectorAll<HTMLButtonElement>('.chip--filter')) {
      const f = getFilter(btn.dataset.filterId ?? '');
      const canvas = btn.querySelector<HTMLCanvasElement>('.chip--filter__thumb');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) continue; // img-based chips (custom thumb) skip this
      if (f.css && f.css !== 'none') ctx.filter = f.css;
      const scale = Math.max(THUMB_W / base.width, THUMB_H / base.height);
      const dw = base.width * scale;
      const dh = base.height * scale;
      ctx.clearRect(0, 0, THUMB_W, THUMB_H);
      ctx.drawImage(base, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
      ctx.filter = 'none';
      if (f.overlay) {
        try {
          const img = await loadImageCached(f.overlay);
          drawOverlay(ctx, img, THUMB_W, THUMB_H, f.fit ?? 'cover');
        } catch {
          /* overlay optional */
        }
      }
    }
    base.close();
  }

  private showStatus(message: string): void {
    if (!this.statusEl) return;
    this.statusEl.querySelector<HTMLElement>('.camera__status-msg')?.replaceChildren(message);
    this.statusEl.hidden = false;
    this.host.querySelector<HTMLElement>('[data-act="capture"]')?.setAttribute('disabled', '');
  }

  private clearStatus(): void {
    if (this.statusEl) this.statusEl.hidden = true;
    this.host.querySelector('[data-act="capture"]')?.removeAttribute('disabled');
  }

  async start(): Promise<void> {
    try {
      const handle = await startCamera('user');
      if (this.stopped) {
        handle.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (this.video) {
        this.video.srcObject = handle.stream;
        await this.video.play().catch(() => undefined);
      }
      void this.applyFilter();
      this.applyMirror();
      this.clearStatus();
      void this.paintFilterThumbs();
    } catch (err) {
      const msg = err instanceof CameraUnavailableError ? err.message : 'Kamera tidak bisa dijalankan. Coba lagi.';
      this.showStatus(msg);
    }
  }

  private async applyFilter(): Promise<void> {
    const css = getFilter(store.get('selectedFilterId')).css;
    if (this.video) this.video.style.filter = css === 'none' ? '' : css;
    await this.applyFilterOverlay();
  }

  private applyMirror(): void {
    if (this.video) this.video.style.transform = this.mirror ? 'scaleX(-1)' : '';
  }

  /** Fold the filter panel into a slim pill (or unfold it back). */
  private setDockCollapsed(collapsed: boolean): void {
    this.dockCollapsed = collapsed;
    saveDockPref(collapsed);
    this.applyDockPref();
  }

  private applyDockPref(): void {
    this.host.querySelector('.camera__dock')?.classList.toggle('is-collapsed', this.dockCollapsed);
    this.host.querySelector('[data-act="dock"]')?.setAttribute('aria-expanded', String(!this.dockCollapsed));
  }

  /**
   * Rasio (lebar/tinggi) stage kamera yang sedang tampil. Dipakai buat
   * memotong hasil jepretan supaya sama persis dengan preview.
   */
  private previewAspect(): number | undefined {
    const stage = this.host.querySelector<HTMLElement>('.camera__stage');
    if (!stage) return undefined;
    const { width, height } = stage.getBoundingClientRect();
    if (width <= 0 || height <= 0) return undefined;
    return width / height;
  }

  /**
   * Resumable capture: 3× (countdown → shot → pause for Ulangi/Lanjut),
   * then a final review. 'restart' loops the whole sequence again; 'confirm'
   * ends it (navigation tears the component down).
   */
  private async captureSequence(): Promise<void> {
    if (this.capturing || this.breaking || !this.video) return;
    this.capturing = true;
    this.setShootingUi(true);

    const label = this.host.querySelector<HTMLElement>('.camera__shot-label')!;

    try {
      let again = true;
      while (again) {
        again = false;

        for (let i = 0; i < this.shots; i++) {
          // Read the filter fresh per shot — user may switch between sessions.
          const filter = getFilter(store.get('selectedFilterId'));
          label.textContent = `Foto ${i + 1} dari ${this.shots}`;
          if (this.timerSecs === 'off') {
            await runCountdown({ seconds: 0 });
          } else {
            await runCountdown({ seconds: this.timerSecs });
          }
          if (this.stopped) return;

          // Potong frame ke rasio preview — hasil = yang terlihat di layar,
          // jadi tidak ada lagi "kelihatan full di kamera, ke-crop di frame".
          const frame = await grabFrame(this.video, this.mirror, this.previewAspect());
          if (!frame) throw new Error('capture failed');
          const baked = await applyFilterToFrame(frame, filter.css, filter.overlay, filter.fit);
          this.photos.push(baked);
          this.opts.onShot(i, baked);
          this.markDot(i);
          flashStage(this.host);

          // Jeda antar sesi: tombol bulat = lanjut, ↺ = ulangi foto ini.
          // Jepretan TERAKHIR tidak dijeda — langsung lanjut ke review
          // (MULAI ULANG / LANJUT EDIT) tanpa minta user menekan shutter
          // sekali lagi.
          if (i === this.shots - 1) {
            this.setShootingUi(false);
            break;
          }

          const action = await this.shotBreak();
          this.setShootingUi(true);
          if (this.stopped) return;

          if (action === 'retake') {
            // Buang hasil sesi ini (bitmap + slot di strip + dot progres).
            baked.close();
            this.photos.pop();
            this.opts.onRetakeOne(i);
            this.unmarkDot(i);
            label.textContent = `Foto ${i + 1} dari ${this.shots}`;
            i -= 1; // sesi yang sama diulang pada putaran berikutnya
            continue;
          }
        }

        label.textContent = 'Selesai ✦';
        // Final review: strip panel already shows all three photos.
        this.host.querySelector<HTMLElement>('.camera__controls')!.hidden = true;
        this.host.querySelector<HTMLElement>('.camera__review')!.hidden = false;
        const finalAction = await this.waitResume();
        this.host.querySelector<HTMLElement>('.camera__review')!.hidden = true;
        this.host.querySelector<HTMLElement>('.camera__controls')!.hidden = false;
        if (this.stopped) return;

        if (finalAction === 'restart') {
          this.photos.forEach((p) => p.close());
          this.photos = [];
          this.opts.onRetakeAll();
          this.host.querySelectorAll('.camera__dots i').forEach((el) => el.classList.remove('is-done'));
          label.textContent = '';
          again = true;
        }
        // 'confirm' resolved via the confirm handler — it navigates away.
      }
    } catch {
      toast('Pengambilan foto gagal — coba lagi.', 'error');
    } finally {
      this.capturing = false;
      this.setShootingUi(false);
    }
  }

  /**
   * Break antar sesi jepretan: kamera jeda, tombol bulat berubah jadi tombol
   * LANJUT (inti hijau) dan tombol ↺ muncul untuk mengulang foto ini.
   * Resolve ketika user menekan salah satunya.
   */
  private shotBreak(): Promise<ResumeAction> {
    return new Promise((resolve) => {
      this.breaking = true;
      this.setShootingUi(false); // tombol bulat & kontrol aktif lagi
      const shutter = this.host.querySelector<HTMLElement>('[data-act="capture"]');
      if (shutter) shutter.setAttribute('aria-label', 'Lanjut foto berikutnya');
      this.host.querySelector('.camera')?.classList.add('is-break');
      this.host.querySelector<HTMLElement>('[data-act="retake-shot"]')?.removeAttribute('hidden');
      this.resumeAction = (action) => {
        this.breaking = false;
        this.host.querySelector('.camera')?.classList.remove('is-break');
        this.host.querySelector<HTMLElement>('[data-act="retake-shot"]')?.setAttribute('hidden', '');
        if (shutter) shutter.setAttribute('aria-label', 'Ambil satu foto');
        resolve(action);
      };
    });
  }

  /** Resolved by resumeWith(); click handlers only supply the action. */
  private waitResume(): Promise<ResumeAction> {
    return new Promise((resolve) => {
      this.resumeAction = resolve;
    });
  }

  private resumeWith(action: ResumeAction): void {
    const resolve = this.resumeAction;
    this.resumeAction = null;
    resolve?.(action);
  }

  private markDot(index: number): void {
    this.host.querySelector<HTMLElement>(`.camera__dots i:nth-child(${index + 1})`)?.classList.add('is-done');
  }

  private unmarkDot(index: number): void {
    this.host.querySelector<HTMLElement>(`.camera__dots i:nth-child(${index + 1})`)?.classList.remove('is-done');
  }

  private setShootingUi(shooting: boolean): void {
    this.host.querySelector<HTMLElement>('.camera')?.classList.toggle('is-shooting', shooting);
    for (const act of ['capture', 'mirror'] as const) {
      const el = this.host.querySelector<HTMLElement>(`[data-act="${act}"]`);
      if (!el) continue;
      if (shooting) el.setAttribute('disabled', '');
      else el.removeAttribute('disabled');
    }
  }

  private confirm(): void {
    const photos = this.photos;
    this.photos = []; // ownership moves to the session
    this.opts.onComplete(photos);
  }

  destroy(): void {
    this.stopped = true;
    this.thumbsToken++;
    this.resumeWith('confirm'); // never leave the capture loop hanging
    this.photos.forEach((p) => p.close());
    this.photos = [];
    void stopCamera();
  }
}

/**
 * Bake the chosen look into the bitmap once, at capture time: CSS tone first,
 * then the drop-in overlay image on top — matching the live preview exactly.
 */
async function applyFilterToFrame(
  frame: ImageBitmap,
  css: string,
  overlaySrc?: string,
  fit: 'cover' | 'contain' = 'cover',
): Promise<ImageBitmap> {
  const hasTone = !!css && css !== 'none';
  if (!hasTone && !overlaySrc) return frame;
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return frame;
  if (hasTone) {
    ctx.filter = css;
    ctx.drawImage(frame, 0, 0);
    ctx.filter = 'none';
  } else {
    ctx.drawImage(frame, 0, 0);
  }
  if (overlaySrc) {
    try {
      const img = await loadImageCached(overlaySrc);
      drawOverlay(ctx, img, canvas.width, canvas.height, fit);
    } catch {
      /* overlay optional */
    }
  }
  frame.close();
  return createImageBitmap(canvas);
}

function flashStage(host: HTMLElement): void {
  const stage = host.querySelector<HTMLElement>('.camera__stage');
  if (!stage) return;
  stage.classList.remove('is-flash');
  void stage.offsetWidth;
  stage.classList.add('is-flash');
}
