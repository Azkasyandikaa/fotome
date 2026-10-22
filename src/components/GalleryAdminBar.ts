/**
 * Bar status galeri. TIDAK ada tombol login di sini — sesi developer hanya
 * didapat lewat halaman khusus #/admin (gerbang tersembunyi: tekan logo
 * "fotome." di header 7x). Kalau sesi itu aktif, galeri otomatis menampilkan
 * mode developer (tombol hapus foto + logout).
 */
import { checkAdmin, adminLogout } from '../services/cloudGallery';
import { toast } from './toast';

export function mountAdminBar(host: HTMLElement, onChanged: () => void): void {
  const bar = document.createElement('div');
  bar.className = 'gallery__admin';
  bar.innerHTML = `
    <span class="gallery__admin-hint" data-admin-hint>Mode publik — lihat & unduh.</span>
    <button type="button" class="btn btn--sm btn--dark" data-admin-logout hidden>LOGOUT</button>
  `;
  host.appendChild(bar);

  const hint = bar.querySelector<HTMLElement>('[data-admin-hint]')!;
  const logoutBtn = bar.querySelector<HTMLButtonElement>('[data-admin-logout]')!;

  let isAdmin = false;

  const render = (): void => {
    logoutBtn.hidden = !isAdmin;
    hint.textContent = isAdmin
      ? 'Mode developer — kamu bisa mengelola galeri.'
      : 'Mode publik — lihat & unduh.';
    hint.classList.toggle('is-admin', isAdmin);
  };

  logoutBtn.addEventListener('click', async () => {
    await adminLogout();
    isAdmin = false;
    render();
    toast('Logout developer ✓');
    onChanged();
  });

  void checkAdmin().then((admin) => {
    isAdmin = admin;
    render();
  });
}
