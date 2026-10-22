import { getPendingExport } from '../../services/exportResult';
import { getSession, destroySession } from '../../services/session';
import { getTemplate } from '../../services/template';
import {
  canvasToBlob,
  downloadCanvasAs,
  makeFilename,
  FORMAT_EXT,
  FORMAT_MIME,
  type ExportFormat,
} from '../../services/download';
import { copyCanvasToClipboard, shareCanvas, shareViaWhatsApp } from '../../services/share';
import { openGalleryUpload } from '../../components/GalleryUpload';
import { openModal } from '../../components/modal';
import { toast } from '../../components/toast';
import { burstConfetti } from '../../components/Confetti';
import { sfxSuccess } from '../../services/sfx';
import { navigate } from '../../app/router';
import site from '../../data/site.json';

/**
 * Rapikan link chat admin: kalau belum ada ?text=, pesan disisipkan biar
 * format tulisan sudah terisi di keyboard user saat chat terbuka.
 */
function buildAdminChatUrl(raw: string, message: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/[?&]text=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}text=${encodeURIComponent(message)}`;
}

/**
 * Popup "berhasil diunduh" + pertanyaan: mau pajang foto di website?
 * Pilihan Ya → WhatsApp admin (diisi lewat site.json → admin.chatUrl).
 * Selama link belum diisi, tombol Ya tampil tapi masih nonaktif.
 */
function openDownloadSuccessModal(): void {
  const admin = site.admin;
  const chatUrl = admin.enabled ? buildAdminChatUrl(admin.chatUrl, admin.message) : null;

  const content = document.createElement('div');
  content.className = 'dl-modal';
  content.innerHTML = `
    <div class="dl-modal__check" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7" /></svg>
    </div>
    <h2 class="modal-title">Foto berhasil diunduh! 🎉</h2>
    <p class="dl-modal__sub">Fotostrip kamu sudah tersimpan di perangkatmu.</p>
    ${
      admin.enabled
        ? `<div class="dl-modal__promo">
             <p class="dl-modal__question">Mau pajang fotomu di website?</p>
             <p class="dl-modal__prompt">${admin.prompt}</p>
           </div>`
        : ''
    }
    <div class="dl-modal__actions">
      ${
        admin.enabled
          ? chatUrl
            ? `<a class="btn btn--primary btn--block" href="${chatUrl}" target="_blank" rel="noreferrer">${admin.buttonLabel}</a>`
            : `<button type="button" class="btn btn--primary btn--block" disabled title="Link WhatsApp admin belum disetel di site.json (admin.chatUrl).">${admin.buttonLabel}</button>`
          : ''
      }
      <button type="button" class="btn ${chatUrl ? 'btn--ghost' : 'btn--primary'} btn--block" data-close>
        ${chatUrl ? 'Nanti deh' : 'Selesai'}
      </button>
    </div>
    ${
      admin.enabled && !chatUrl
        ? '<p class="dl-modal__hint">Tombolnya aktif begitu link WhatsApp admin diisi.</p>'
        : ''
    }
  `;

  const modal = openModal(content, 'Foto berhasil diunduh');
  content.querySelector('[data-close]')?.addEventListener('click', modal.close);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || makeFilename();
}

/**
 * /download — spec §5.4.
 * Shows the final composite, then PNG/JPEG export with the file name and the
 * exact output resolution. Nothing here talks to the server.
 */
export function mountDownloadPage(host: HTMLElement): () => void {
  const pending = getPendingExport();
  const session = getSession();

  if (!pending || !session) {
    toast(session ? 'Belum ada hasil. Hias fotomu dulu.' : 'Belum ada foto. Ambil foto dulu.', 'info');
    navigate(session ? '/edit' : '/capture');
    return () => undefined;
  }

  const template = getTemplate(pending.templateId);
  const canvas = pending.canvas;
  let format: ExportFormat = 'png';
  let filename = makeFilename(FORMAT_EXT[format]);
  let destroyed = false;

  host.innerHTML = `
    <section class="download">
      <div class="download__grid container">
        <div class="download__preview">
          <div class="download__frame" data-frame>
            <div class="skeleton" role="status" aria-live="polite">
              <span class="skeleton__shimmer" aria-hidden="true"></span>
              <span class="skeleton__text">Menyiapkan fotomu…</span>
            </div>
          </div>
          <p class="download__caption" data-caption></p>
        </div>

        <aside class="download__panel card" aria-label="Pengaturan unduhan">
          <div class="card__body">
            <p class="label">✦ Unduh hasil</p>
            <h1 class="download__title">Fotostrip kamu siap</h1>
            <p class="download__sub">Periksa hasilnya, pilih format, lalu simpan ke perangkatmu.</p>

            <div class="result-list">
              <label class="result-row">
                <span class="result-row__label">Nama file</span>
                <input class="result-row__input" type="text" data-filename value="" spellcheck="false" />
              </label>

              <div class="result-row">
                <span class="result-row__label" id="fmt-label">Format</span>
                <div class="segmented" role="radiogroup" aria-labelledby="fmt-label">
                  <button type="button" class="segmented__btn is-active" data-format="png" role="radio" aria-checked="true">PNG</button>
                  <button type="button" class="segmented__btn" data-format="jpeg" role="radio" aria-checked="false">JPEG</button>
                </div>
              </div>

              <div class="result-row">
                <span class="result-row__label">Resolusi</span>
                <span class="result-row__value" data-resolution>${canvas.width} × ${canvas.height} px</span>
              </div>

              <div class="result-row">
                <span class="result-row__label">Perkiraan ukuran</span>
                <span class="result-row__value" data-size aria-live="polite">…</span>
              </div>
            </div>

            <p class="download__error" data-error hidden>
              <span class="download__error-text">Unduhan gagal.</span>
              <button type="button" class="btn btn--sm btn--secondary" data-retry>Coba Lagi</button>
            </p>

            <div class="download__actions">
              <button type="button" class="btn btn--primary btn--lg btn--block" data-download>Unduh Foto</button>
              <button type="button" class="btn btn--secondary btn--block" data-edit>Edit Ulang</button>
              <button type="button" class="btn btn--ghost btn--block" data-new>Buat Fotostrip Baru</button>
            </div>

            <div class="download__extra">
              <button type="button" class="chip" data-share>Bagikan</button>
              <button type="button" class="chip" data-copy>Salin gambar</button>
              <button type="button" class="chip" data-gallery hidden>Simpan ke galeri</button>
            </div>

            <p class="download__privacy">Foto diproses langsung di browser kamu. Tidak ada yang diunggah tanpa izinmu.</p>
          </div>
        </aside>
      </div>
    </section>
  `;

  const frame = host.querySelector<HTMLElement>('[data-frame]')!;
  const caption = host.querySelector<HTMLElement>('[data-caption]')!;
  const sizeEl = host.querySelector<HTMLElement>('[data-size]')!;
  const errorBox = host.querySelector<HTMLElement>('[data-error]')!;
  const fileInput = host.querySelector<HTMLInputElement>('[data-filename]')!;
  const downloadBtn = host.querySelector<HTMLButtonElement>('[data-download]')!;
  const formatBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-format]'));

  fileInput.value = filename;
  caption.textContent = template ? `${template.name} · ${canvas.width} × ${canvas.height} px` : '';

  const refreshSize = async (): Promise<void> => {
    try {
      const blob = await canvasToBlob(canvas, 0.92, FORMAT_MIME[format]);
      if (destroyed) return;
      sizeEl.textContent = formatBytes(blob.size);
    } catch {
      if (destroyed) return;
      sizeEl.textContent = '—';
    }
  };

  // First paint: skeleton → real composite once the size probe resolves.
  void (async () => {
    await refreshSize();
    if (destroyed) return;
    frame.replaceChildren(canvas);
    frame.classList.add('is-ready');
  })();

  // ---- format -------------------------------------------------------------
  const setFormat = (next: ExportFormat): void => {
    if (next === format) return;
    const oldExt = FORMAT_EXT[format];
    format = next;
    formatBtns.forEach((b) => {
      const on = b.dataset.format === format;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    // Keep the user's custom stem, only swap the extension.
    const stem = filename.replace(new RegExp(`\\.${oldExt}$`, 'i'), '');
    filename = `${stem}.${FORMAT_EXT[format]}`;
    fileInput.value = filename;
    sizeEl.textContent = '…';
    void refreshSize();
  };

  formatBtns.forEach((b) =>
    b.addEventListener('click', () => setFormat(b.dataset.format as ExportFormat)),
  );

  fileInput.addEventListener('input', () => {
    filename = fileInput.value;
  });
  fileInput.addEventListener('blur', () => {
    const clean = sanitizeName(filename);
    const ext = FORMAT_EXT[format];
    filename = clean.toLowerCase().endsWith(`.${ext}`) ? clean : `${clean.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;
    fileInput.value = filename;
  });

  // ---- download -----------------------------------------------------------
  const showError = (msg: string): void => {
    errorBox.hidden = false;
    const text = errorBox.querySelector<HTMLElement>('.download__error-text');
    if (text) text.textContent = msg;
  };

  const hideError = (): void => {
    errorBox.hidden = true;
  };

  const runDownload = async (): Promise<void> => {
    hideError();
    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent ?? 'Unduh Foto';
    downloadBtn.textContent = 'Menyiapkan…';
    try {
      const ext = FORMAT_EXT[format];
      const name = sanitizeName(filename);
      const finalName = name.toLowerCase().endsWith(`.${ext}`) ? name : `${name.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;
      filename = finalName;
      fileInput.value = finalName;
      await downloadCanvasAs(canvas, finalName, format);
      if (destroyed) return;
      burstConfetti();
      sfxSuccess();
      openDownloadSuccessModal();
    } catch {
      if (destroyed) return;
      showError('Unduhan gagal. Coba lagi.');
      toast('Unduhan gagal. Coba lagi.', 'error');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }
  };

  downloadBtn.addEventListener('click', () => void runDownload());
  host.querySelector('[data-retry]')?.addEventListener('click', () => void runDownload());

  // ---- secondary actions --------------------------------------------------
  host.querySelector('[data-edit]')?.addEventListener('click', () => navigate('/edit'));

  host.querySelector('[data-new]')?.addEventListener('click', () => {
    destroySession(); // clears pending export + draft layers too
    navigate('/');
  });

  host.querySelector('[data-copy]')?.addEventListener('click', async () => {
    const ok = await copyCanvasToClipboard(canvas);
    toast(ok ? 'Gambar disalin ke clipboard.' : 'Browser tidak mengizinkan salin gambar.', ok ? 'info' : 'error');
  });

  host.querySelector('[data-share]')?.addEventListener('click', async () => {
    const shared = await shareCanvas(canvas, 'Fotome Photobooth', 'Hasil fotostripku dari Fotome!');
    if (shared) return;
    shareViaWhatsApp('Lihat fotostripku dari Fotome! Coba juga di ' + window.location.origin);
    toast('Dibuka di WhatsApp — tempel gambar yang sudah kamu unduh ya.');
  });

  const galleryBtn = host.querySelector<HTMLButtonElement>('[data-gallery]');
  if (galleryBtn) {
    void openGalleryUpload({ canvas, templateName: pending.templateName }).then((available) => {
      if (!destroyed) galleryBtn.hidden = !available;
    });
    galleryBtn.addEventListener('click', () => {
      void openGalleryUpload({ canvas, templateName: pending.templateName });
    });
  }

  return () => {
    // The pending export + editor draft stay alive so "Edit Ulang" can round
    // trip; both are dropped in destroySession() when a session ends.
    destroyed = true;
  };
}
