/** Big 3-2-1 countdown overlay, returns via callback then resolves. */
import { sfxTick, sfxShutter } from '../services/sfx';

export interface CountdownOptions {
  seconds?: number;
  tick?: (value: number) => void;
  /** Called right before resolve — the shutter moment. */
  flash?: () => void;
  /** Called after the overlay is removed. */
  done?: () => void;
}

export function runCountdown(opts: CountdownOptions = {}): Promise<void> {
  const seconds = opts.seconds ?? 3;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'countdown-overlay';
    overlay.setAttribute('aria-live', 'assertive');
    // Angka pertama langsung sesuai pilihan timer (5 detik → “5”), jangan
    // pernah sempat tampil “3” bawaan sebelum tick pertama.
    overlay.innerHTML = `<div class="countdown-number">${Math.max(1, Math.round(seconds))}</div>`;
    document.body.appendChild(overlay);

    let n = seconds;
    const num = overlay.querySelector<HTMLElement>('.countdown-number')!;
    let done = false;

    // seconds: 0 -> no countdown, straight to the shutter flash.
    if (seconds <= 0) {
      overlay.remove();
      sfxShutter();
      opts.flash?.();
      resolve();
      opts.done?.();
      return;
    }

    const finish = (): void => {
      if (done) return;
      done = true;
      sfxShutter();
      opts.flash?.();
      overlay.classList.add('countdown-overlay--flash');
      window.setTimeout(() => {
        overlay.remove();
        resolve();
        opts.done?.();
      }, 260);
    };

    const step = (): void => {
      if (n <= 0) {
        finish();
        return;
      }
      num.textContent = String(n);
      num.classList.remove('is-ticking');
      void num.offsetWidth; // restart the pop animation
      num.classList.add('is-ticking');
      sfxTick();
      opts.tick?.(n);
      n -= 1;
      window.setTimeout(step, 1000);
    };

    window.setTimeout(step, 400);
    // Allow cancelling by navigating away.
    overlay.addEventListener('countdown:cancel', finish as EventListener);
  });
}

// Small augmentation so the cancel event name exists on elements.
declare global {
  interface HTMLElementEventMap {
    'countdown:cancel': Event;
  }
}
