import site from '../data/site.json';
import { openModal } from './modal';

/** Placeholder jika public/qr.png belum ada — jelas beda dengan QR asli. */
function makeQrPlaceholder(): string {
  const cv = document.createElement('canvas');
  cv.width = 180;
  cv.height = 180;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 180, 180);
  ctx.strokeStyle = '#6d5efc';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 168, 168);
  ctx.setLineDash([]);
  ctx.fillStyle = '#16181d';
  ctx.textAlign = 'center';
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText('TARUH', 90, 70);
  ctx.font = "800 20px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = '#6d5efc';
  ctx.fillText('qr.png', 90, 96);
  ctx.font = "700 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = '#16181d';
  ctx.fillText('di folder public/', 90, 120);
  return cv.toDataURL('image/png');
}

/** Static donation info modal — no payment processing. */
export function openDonationModal(): void {
  const d = site.donation;
  if (!d.enabled) {
    return;
  }
  const content = document.createElement('div');
  content.className = 'donation';
  content.innerHTML = `
    <h2 class="modal-title">Dukung Fotome</h2>
    <img class="donation__qr" src="${d.qrImage}" alt="Donation QR code" width="180" height="180" />
    <ul class="donation__methods">
      ${d.methods
        .map(
          () => `
        <li class="donation__method">
          <span class="donation__method-name"></span>
          <span class="donation__method-account"></span>
        </li>`,
        )
        .join('')}
    </ul>
    <p class="donation__note"></p>
    <button type="button" class="btn btn--ghost" data-close>Close</button>
  `;
  const methods = content.querySelectorAll<HTMLElement>('.donation__method');
  d.methods.forEach((m, i) => {
    const row = methods[i];
    if (!row) return;
    row.querySelector<HTMLElement>('.donation__method-name')!.textContent = m.name;
    row.querySelector<HTMLElement>('.donation__method-account')!.textContent = m.account;
  });
  content.querySelector<HTMLElement>('.donation__note')!.textContent = d.note;

  // qr.png belum ditaruh di public/ -> gambar placeholder yang jelas,
  // supaya kelihatan bedanya dengan QR asli (tinggal timpa public/qr.png).
  content.querySelector<HTMLImageElement>('.donation__qr')?.addEventListener('error', (e) => {
    const img = e.currentTarget as HTMLImageElement;
    if (img.src.startsWith('data:')) return;
    img.src = makeQrPlaceholder();
  });

  const modal = openModal(content, 'Informasi donasi');
  content.querySelector('[data-close]')?.addEventListener('click', modal.close);
}
