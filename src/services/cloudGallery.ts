/**
 * Klien galeri publik + admin (developer-only upload).
 * Semua endpoint ke /api/gallery/*.
 */

export interface GalleryStatus {
  driveConfigured: boolean;
  authConfigured: boolean;
  devBypass: boolean;
}

export interface PublicPhoto {
  id: string;
  title: string;
  template: string;
  driveLink: string | null;
  size: number;
  createdAt: number;
  /** Ditandai developer → tampil di showcase homepage. */
  featured?: boolean;
}

export interface UploadResult {
  id: string;
  driveId: string | null;
  driveLink: string | null;
  title: string;
  template: string;
  createdAt: number;
}

export async function fetchGalleryStatus(): Promise<GalleryStatus | null> {
  try {
    const res = await fetch('/api/gallery/status');
    if (!res.ok) return null;
    return (await res.json()) as GalleryStatus;
  } catch {
    return null;
  }
}

export async function fetchPublicPhotos(): Promise<PublicPhoto[]> {
  try {
    const res = await fetch('/api/gallery/photos');
    if (!res.ok) return [];
    const data = (await res.json()) as { photos: PublicPhoto[] };
    return data.photos ?? [];
  } catch {
    return [];
  }
}

export function photoImageUrl(id: string): string {
  return `/api/gallery/photos/${encodeURIComponent(id)}/img`;
}

/** Foto pilihan developer untuk showcase homepage (maksimal 12, terbaru dulu). */
export async function fetchFeaturedPhotos(): Promise<PublicPhoto[]> {
  try {
    const res = await fetch('/api/gallery/featured', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { photos: PublicPhoto[] };
    return data.photos ?? [];
  } catch {
    return [];
  }
}

/** Setel foto mana saja yang tampil di homepage (ceklis dashboard developer). */
export async function setFeaturedPhotos(ids: string[]): Promise<void> {
  const res = await fetch('/api/gallery/featured', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
}

export async function checkAdmin(): Promise<boolean> {
  try {
    const res = await fetch('/api/gallery/me');
    if (!res.ok) return false;
    const data = (await res.json()) as { admin: boolean };
    return data.admin === true;
  } catch {
    return false;
  }
}

export async function adminLogin(password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/gallery/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  try {
    await fetch('/api/gallery/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
}

/**
 * Upload satu fotostrip (JPEG blob) ke galeri publik.
 * Server meneruskannya ke Google Drive bila dikonfigurasi.
 */
/** Batas ukuran unggahan foto galeri di server (lihat server/gallery.ts). */
export const MAX_UPLOAD_MB = 48;

export async function uploadToGallery(
  blob: Blob,
  meta: { title?: string; template?: string; featured?: boolean } = {},
  onProgress?: (sent: number, total: number) => void,
): Promise<UploadResult> {
  if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(
      `File terlalu besar (${(blob.size / 1024 / 1024).toFixed(1)} MB) — maksimal ${MAX_UPLOAD_MB} MB.`,
    );
  }
  const qs = new URLSearchParams();
  if (meta.title) qs.set('title', meta.title);
  if (meta.template) qs.set('template', meta.template);
  if (meta.featured) qs.set('featured', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  // XHR supaya bisa progress upload (fetch belum punya upload progress).
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/gallery/photos${suffix}`);
    xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error('Respon server tidak valid'));
        }
      } else if (xhr.status === 401) {
        reject(new Error('unauthorized'));
      } else if (xhr.status === 413) {
        reject(new Error(`File terlalu besar — maksimal ${MAX_UPLOAD_MB} MB per file.`));
      } else if (xhr.status === 415) {
        reject(new Error('Format file tidak didukung — pakai JPG, PNG, atau WebP.'));
      } else if (xhr.status === 429) {
        reject(new Error('Terlalu banyak permintaan — tunggu sebentar lalu coba lagi.'));
      } else {
        let detail = '';
        try {
          const body = JSON.parse(xhr.responseText) as { error?: unknown };
          if (typeof body?.error === 'string' && body.error) detail = ` — ${body.error}`;
        } catch {
          /* body bukan JSON */
        }
        reject(new Error(`Upload gagal (HTTP ${xhr.status})${detail}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          `Koneksi terputus saat upload — file mungkin terlalu besar (maks ${MAX_UPLOAD_MB} MB) ` +
            'atau server galeri belum/tersendat (di mode dev: jalankan `PORT=8787 npm run serve`).',
        ),
      );
    xhr.send(blob);
  });
}

/** Ganti nama (judul) foto galeri — panel foto homepage di dashboard. */
export async function renamePublicPhoto(id: string, title: string): Promise<string> {
  const res = await fetch(`/api/gallery/photos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
  const data = (await res.json()) as { title?: string };
  return data.title ?? title;
}

export async function deletePublicPhoto(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/gallery/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
