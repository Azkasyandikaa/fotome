import { openModal } from './modal';
import { navigate } from '../app/router';

/** Pilihan layout yang dipaksa pengguna — bukan deteksi layar. */
export type LayoutPref = 'phone' | 'desktop';

const DONE_KEY = 'photobooth.onboarded';
const LAYOUT_KEY = 'photobooth.layout';

function readLayoutPref(): LayoutPref | null {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === 'phone' || v === 'desktop' ? v : null;
  } catch {
    return null; // storage unavailable — biarkan responsif default
  }
}

function writeLayoutPref(pref: LayoutPref): void {
  try {
    localStorage.setItem(LAYOUT_KEY, pref);
  } catch {
    /* ignore */
  }
}

/** Pasang preferensi layout secepat mungkin saat boot (sebelum render). */
export function applyLayoutPref(): void {
  const pref = readLayoutPref();
  if (pref) document.documentElement.dataset.layout = pref;
}

function isOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true; // tanpa storage: jangan pernah mengulang onboarding
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Alur pembuka website (sekali per browser):
 *   1. pilih HP atau Desktop → menyesuaikan tata letak
 *   2. pilih mau baca guide atau langsung mulai
 */
export function runOnboarding(): void {
  if (isOnboarded()) return;
  openDeviceStep();
}

function openDeviceStep(): void {
  const content = document.createElement('div');
  content.className = 'onb';
  content.innerHTML = `
    <h2 class="modal-title">Buka dari mana nih? ✦</h2>
    <p class="onb__sub">Pilih perangkatmu supaya tata letak website-nya pas.</p>
    <div class="onb__cards">
      <button type="button" class="onb-card" data-device="phone">
        <span class="onb-card__icon" aria-hidden="true">📱</span>
        <span class="onb-card__title">HP</span>
        <span class="onb-card__hint">Satu kolom, ringkas untuk layar kecil</span>
      </button>
      <button type="button" class="onb-card" data-device="desktop">
        <span class="onb-card__icon" aria-hidden="true">💻</span>
        <span class="onb-card__title">Desktop / Laptop</span>
        <span class="onb-card__hint">Tampilan lebar, banyak kolom</span>
      </button>
    </div>
    <p class="onb__note">Tata letak bisa kamu ubah lagi dengan membuka website di perangkat lain.</p>
  `;

  const modal = openModal(content, 'Pilih tata letak');
  content.querySelectorAll<HTMLButtonElement>('[data-device]').forEach((b) =>
    b.addEventListener('click', () => {
      const pref = (b.dataset.device === 'desktop' ? 'desktop' : 'phone') as LayoutPref;
      writeLayoutPref(pref);
      document.documentElement.dataset.layout = pref;
      modal.close();
      // Tunggu modal pertama lepas dulu, baru tawarkan guide.
      window.setTimeout(openGuideStep, 180);
    }),
  );
}

function openGuideStep(): void {
  const content = document.createElement('div');
  content.className = 'onb';
  content.innerHTML = `
    <h2 class="modal-title">Mau baca cara pakainya?</h2>
    <p class="onb__sub">Cuma 4 langkah: pilih frame → jepret → hias stiker → unduh. Kurang dari 2 menit.</p>
    <div class="onb__actions">
      <button type="button" class="btn btn--primary btn--block" data-guide>📖 Baca guide dulu</button>
      <button type="button" class="btn btn--ghost btn--block" data-skip>Langsung mulai ✦</button>
    </div>
  `;

  const modal = openModal(content, 'Baca guide?');
  const finish = (withGuide: boolean): void => {
    markOnboarded();
    modal.close();
    if (withGuide) navigate('/guide');
  };
  content.querySelector('[data-guide]')?.addEventListener('click', () => finish(true));
  content.querySelector('[data-skip]')?.addEventListener('click', () => finish(false));
}