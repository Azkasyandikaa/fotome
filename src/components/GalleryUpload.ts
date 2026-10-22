/**
 * Opsional: kirim hasil ke galeri via server (hanya untuk developer).
 * Server menyimpan file — inilah SATU-satunya jalan foto meninggalkan
 * perangkat, dan hanya setelah pengguna menekan tombol secara eksplisit.
 */
import { openModal } from './modal';
import { toast } from './toast';
import {
  fetchGalleryStatus,
  checkAdmin,
  adminLogin,
  uploadToGallery,
  type GalleryStatus,
} from '../services/cloudGallery';

export interface GalleryUploadData {
  canvas: HTMLCanvasElement;
  templateName: string;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
}

/** Opens the drive/gallery prompt. Returns false when the feature is off. */
export async function openGalleryUpload(data: GalleryUploadData): Promise<boolean> {
  const status: GalleryStatus | null = await fetchGalleryStatus();
  const driveAvailable = status?.driveConfigured === true;
  const galleryAvailable = status?.authConfigured === true;
  if (!galleryAvailable && !driveAvailable) return false;

  const isAdmin = galleryAvailable ? await checkAdmin() : false;
  let admin = isAdmin;

  const content = document.createElement('div');
  content.className = 'dl-drive';
  content.innerHTML = `
    <div class="dl-drive__info">
      <span class="dl-drive__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7.9 3.5h8.2l6 10.4-4.1 7.1H6l-4.1-7.1z"/></svg>
      </span>
      <p class="dl-drive__text">Masukkan foto ini ke galeri via Google Drive?</p>
    </div>
    <div class="dl-drive__actions">
      <button type="button" class="btn btn--sm btn--primary" data-drive-yes>Ya, simpan ke galeri</button>
      <button type="button" class="btn btn--sm btn--ghost" data-drive-no>Batal</button>
    </div>
    <div class="dl-drive__progress" data-drive-progress hidden>
      <div class="dl-drive__bar"><i data-drive-bar></i></div>
      <span class="dl-drive__pct" data-drive-pct>0%</span>
    </div>
  `;

  const modal = openModal(content, 'Simpan ke galeri');
  const yesBtn = content.querySelector<HTMLButtonElement>('[data-drive-yes]')!;
  const noBtn = content.querySelector<HTMLButtonElement>('[data-drive-no]')!;
  noBtn.addEventListener('click', modal.close);

  const showProgress = (): { set(pct: number): void } => {
    const box = content.querySelector<HTMLElement>('[data-drive-progress]');
    const bar = content.querySelector<HTMLElement>('[data-drive-bar]');
    const pct = content.querySelector<HTMLElement>('[data-drive-pct]');
    if (box) box.hidden = false;
    yesBtn.disabled = true;
    noBtn.disabled = true;
    return {
      set(p: number): void {
        const v = Math.max(0, Math.min(100, Math.round(p)));
        if (bar) bar.style.width = `${v}%`;
        if (pct) pct.textContent = `${v}%`;
      },
    };
  };

  yesBtn.addEventListener('click', async () => {
    if (!admin) {
      const pw = window.prompt('Khusus developer.\nMasukkan password galeri:');
      if (pw === null) return;
      if (!pw.trim()) {
        toast('Password kosong.', 'error');
        return;
      }
      const ok = await adminLogin(pw.trim());
      if (!ok) {
        toast('Password salah. Upload hanya untuk developer.', 'error');
        return;
      }
      admin = true;
      toast('Login developer berhasil.', 'success');
    }

    const progress = showProgress();
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        data.canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Gagal encode gambar'))),
          'image/jpeg',
          0.9,
        );
      });
      const result = await uploadToGallery(
        blob,
        { title: `fotome-${stamp()}`, template: data.templateName },
        (sent, total) => progress.set((sent / total) * 90),
      );
      progress.set(100);
      if (result.driveLink) {
        toast('Foto masuk galeri & terkirim ke Google Drive.', 'success');
      } else {
        toast('Foto masuk galeri. (Drive belum dikonfigurasi — disimpan di server)');
      }
      window.setTimeout(modal.close, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload gagal';
      toast(msg === 'unauthorized' ? 'Sesi developer habis — login ulang.' : msg, 'error');
      yesBtn.disabled = false;
      noBtn.disabled = false;
      const box = content.querySelector<HTMLElement>('[data-drive-progress]');
      if (box) box.hidden = true;
    }
  });

  return true;
}
