import type { ImageBitmap } from '../../types/dom-shims';
import { Camera } from '../../components/Camera';
import { StripPreview } from '../../components/StripPreview';
import { getTemplate, initCatalog, syncShotCountToTemplate } from '../../services/template';
import { store } from '../../app/state';
import { navigate } from '../../app/router';
import { stopCamera } from '../../services/camera';
import { destroySession, createSession } from '../../services/session';
import { preloadTemplateFrame, reportFrameUse } from '../../services/booth';

/**
 * Two-phase capture page:
 *  1. PICK    — template list left, big preview right, PILIH button.
 *  2. CAPTURE — camera right, live strip left filling slot per slot.
 */
export function mountCapturePage(host: HTMLElement): () => void {
  if (!store.get('session')) {
    destroySession(); // leaving mid-session cleans everything
  }

  host.innerHTML = `
    <section class="capture is-fullview">
      <aside class="capture__side"><div class="side-slot"></div></aside>
      <div class="capture__main"><div class="main-slot"></div></div>
    </section>
  `;

  const sideSlot = host.querySelector<HTMLElement>('.side-slot')!;
  const mainSlot = host.querySelector<HTMLElement>('.main-slot')!;
  let camera: Camera | null = null;
  let strip: StripPreview;
  let destroyed = false;

  strip = new StripPreview(sideSlot, mainSlot, {
    onConfirm: () => {
      if (destroyed) return;
      void startCapturePhase();
    },
    onRetake: () => {
      if (destroyed) return;
      // Back to picking (also used by "GANTI TEMPLATE").
      camera?.destroy();
      camera = null;
      void strip.showPicker();
      mountPickLayout();
    },
  });

  function mountPickLayout(): void {
    host.querySelector<HTMLElement>('.capture')!.classList.remove('capture--live');
  }

  async function startCapturePhase(): Promise<void> {
    await initCatalog();
    const template = getTemplate(store.get('selectedTemplateId'));
    if (!template) {
      await strip.showPicker();
      return;
    }
    // Jepretan ngikutin jumlah slot frame (1/2/3) sebelum kamera hidup.
    syncShotCountToTemplate(template);
    void preloadTemplateFrame(template);

    // Swap layout: strip panel left, camera right.
    host.querySelector<HTMLElement>('.capture')!.classList.add('capture--live');
    strip.showStrip(template);
    mainSlot.innerHTML = '';

    camera = new Camera(mainSlot, {
      onShot: (_i, photo) => strip.addPhoto(photo),
      onRetakeOne: (index) => {
        // Camera already popped & closed the bitmap; drop the matching slot.
        if (index === strip.getPhotos().length - 1) strip.removeLast();
        else strip.reset();
      },
      onRetakeAll: () => {
        strip.reset();
      },
      onComplete: (photos: ImageBitmap[]) => {
        createSession(template.id, store.get('selectedFilterId'), photos);
        // Leaderboard frame: satu frame dihitung dipakai tiap sesi jepretan
        // selesai — 5 teratas otomatis tampil di homepage.
        void reportFrameUse(template.id);
        void stopCamera();
        navigate('/edit');
      },
    });
  }

  void strip.showPicker();

  return () => {
    destroyed = true;
    camera?.destroy();
  };
}
