/**
 * Galeri v2 — galeri publik: foto yang disetujui developer (disimpan via
 * Google Drive + cache server). Semua orang bisa lihat & unduh.
 * Ada lightbox untuk lihat besar + unduh, dan bar login developer (hapus foto).
 */
import {
  fetchGalleryStatus,
  fetchPublicPhotos,
  photoImageUrl,
  checkAdmin,
  deletePublicPhoto,
  type PublicPhoto,
} from '../services/cloudGallery';
import { toast } from './toast';
import { mountAdminBar } from './GalleryAdminBar';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function downloadDataUrl(dataUrl: string, name: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadUrl(url: string, name: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    downloadDataUrl(objUrl, name);
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    toast('Foto diunduh ✓');
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ---- Lightbox sederhana ----

function openLightbox(src: string, title: string, downloadName: string): void {
  const back = document.createElement('div');
  back.className = 'lightbox';
  back.innerHTML = `
    <figure class="lightbox__inner">
      <img class="lightbox__img" alt="${escapeHtml(title)}" src="${src}" />
      <figcaption class="lightbox__cap">
        <span>${escapeHtml(title)}</span>
        <span class="lightbox__acts">
          <button type="button" class="btn btn--sm btn--primary" data-lb-dl>⬇ UNDUH</button>
          <button type="button" class="btn btn--sm btn--ghost" data-lb-close>TUTUP</button>
        </span>
      </figcaption>
    </figure>
  `;
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';

  const close = (): void => {
    back.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('[data-lb-close]')?.addEventListener('click', close);
  back.querySelector('[data-lb-dl]')?.addEventListener('click', () => {
    if (src.startsWith('data:')) downloadDataUrl(src, downloadName);
    else void downloadUrl(src, downloadName);
  });
}

export function mountGalleryPage(host: HTMLElement): void {
  host.innerHTML = `
    <section class="gallery">
      <header class="gallery__head">
        <p class="gallery__kicker">✦ galeri fotome ✦</p>
        <h1 class="gallery__title">Momen yang <em>tersimpan</em></h1>
        <p class="gallery__sub" data-gallery-sub>Memuat galeri…</p>
      </header>
      <div data-admin-bar></div>

      <div class="gallery__grid" aria-live="polite" data-grid-public></div>
      <div class="gallery__empty" data-empty-public hidden>
        <div class="gallery__empty-art" aria-hidden="true">🌸</div>
        <h2>Galeri masih sepi</h2>
        <p>Foto pilihan developer akan muncul di sini — ambil fotomu, lalu tawarkan lewat tombol galeri setelah download.</p>
        <a class="btn btn--primary" href="#/capture">MULAI FOTO</a>
      </div>
    </section>
  `;

  const sub = host.querySelector<HTMLElement>('[data-gallery-sub]')!;
  const gridPublic = host.querySelector<HTMLElement>('[data-grid-public]')!;
  const emptyPublic = host.querySelector<HTMLElement>('[data-empty-public]')!;

  let isAdmin = false;

  const publicCard = (photo: PublicPhoto): HTMLElement => {
    const el = document.createElement('figure');
    el.className = 'gallery__card';
    el.innerHTML = `
      <div class="gallery__img-wrap">
        <img class="gallery__img" alt="Foto galeri ${escapeHtml(photo.title)}" loading="lazy" />
        <span class="gallery__date">${fmtDate(photo.createdAt)}</span>
        ${photo.driveLink ? '<span class="gallery__badge" title="Tersimpan di Google Drive">⚡ Drive</span>' : ''}
      </div>
      <figcaption class="gallery__meta">
        <span class="gallery__tpl">${escapeHtml(photo.title)}</span>
        <span class="gallery__acts">
          <button type="button" class="chip" data-act="dl" title="Unduh foto">⬇</button>
          ${isAdmin ? `<button type="button" class="chip chip--danger" data-act="del" title="Hapus dari galeri publik">🗑</button>` : ''}
        </span>
      </figcaption>
    `;
    const img = el.querySelector<HTMLImageElement>('.gallery__img')!;
    img.src = photoImageUrl(photo.id);

    el.querySelector('[data-act="dl"]')?.addEventListener('click', () => {
      void downloadUrl(photoImageUrl(photo.id), `fotome-${photo.title}.jpg`);
    });
    el.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      if (!window.confirm('Hapus foto ini dari galeri publik?')) return;
      void deletePublicPhoto(photo.id).then((ok) => {
        if (ok) {
          toast('Foto dihapus dari galeri ✓');
          void rerenderPublic();
        } else {
          toast('Gagal menghapus (butuh login developer).', 'error');
        }
      });
    });
    img.addEventListener('click', () => {
      openLightbox(photoImageUrl(photo.id), photo.title, `fotome-${photo.title}.jpg`);
    });
    return el;
  };

  const rerenderPublic = async (): Promise<void> => {
    const photos = await fetchPublicPhotos();
    emptyPublic.hidden = photos.length > 0;
    gridPublic.replaceChildren(...photos.map(publicCard));
    return undefined;
  };

  const refreshAdmin = async (): Promise<void> => {
    isAdmin = await checkAdmin();
    // Render ulang kartu publik supaya tombol hapus ikut muncul/hilang.
    await rerenderPublic();
  };

  mountAdminBar(host.querySelector<HTMLElement>('[data-admin-bar]')!, () => void refreshAdmin());

  void (async () => {
    const status = await fetchGalleryStatus();
    if (status && status.authConfigured) {
      sub.textContent = 'Foto pilihan developer — tersimpan via Google Drive. Klik foto untuk memperbesar.';
    } else {
      sub.textContent = 'Galeri publik belum aktif — cek panduan setup di docs/GALLERY-GDRIVE.md.';
    }
    await rerenderPublic();
  })();
}
