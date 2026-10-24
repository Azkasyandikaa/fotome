import { toast } from '../../components/toast';
import { navigate } from '../../app/router';
import {
  adminLogin,
  deletePublicPhoto,
  fetchGalleryStatus,
  fetchPublicPhotos,
  photoImageUrl,
  renamePublicPhoto,
  setFeaturedPhotos,
  uploadToGallery,
  type PublicPhoto,
} from '../../services/cloudGallery';
import {
  defaultSlots,
  fetchBoothAdminStatus,
  saveBoothTemplateConfig,
  uploadBoothFrame,
  uploadBoothThumb,
  removeBoothThumb,
  deleteBoothTemplate,
  saveBoothCategories,
  saveShowcaseShape,
  saveShowcaseFrames,
  getBoothShowcaseFrames,
  SHOWCASE_SHAPES,
  DEFAULT_SHOWCASE_SHAPE,
  MAX_SHOWCASE_FRAMES,
  type BoothTemplateEntry,
  type BoothFilterEntry,
  type BoothStickerEntry,
  type BoothLeaderboardEntry,
} from '../../services/booth';
import { getEnabledTemplates, initCatalog } from '../../services/template';

/**
 * #/admin — Studio settingan frame (khusus admin).
 * Admin atur tiap frame TANPA buka kode:
 *   - geser & ubah ukuran lubang foto langsung di atas frame (drag + handle)
 *   - putar lubang foto (knob) + atur rotasi/zoom presisi seperti stiker
 *   - tambah/hapus slot (1–5), pilih fit cover/contain
 *   - upload frame baru (PNG transparan) langsung dari browser
 *   - ubah nama, kategori, deskripsi, ukuran kanvas, warna latar
 * Plus dashboard status: server, jumlah frame/stiker/filter/musik/galeri.
 * Hasilnya ditulis ke booth/templates/<id>/template.json — langsung aktif
 * untuk semua pengunjung, tanpa build ulang.
 */
interface EditSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  /** Rotasi lubang foto (derajat, positif = searah jarum jam). */
  rotation: number;
  /** Zoom isi foto di dalam lubang (1 = pas). */
  scale: number;
}

interface Draft {
  name: string;
  category: string;
  /** Semua kategori frame — frame muncul di setiap kategori yang dicentang. */
  categories: string[];
  description: string;
  canvasW: number;
  canvasH: number;
  background: string;
  slots: EditSlot[];
}

const MIN_SLOT = 40; // px kanvas

function fmtUptime(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} dtk`;
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam`;
  return `${Math.floor(sec / 86400)} hari`;
}

export function mountAdminFramesPage(host: HTMLElement): () => void {
  let destroyed = false;
  let entries: BoothTemplateEntry[] = [];
  let selectedId = '';
  let draft: Draft | null = null;
  let selectedSlot = 0;
  /** Cache-buster supaya perubahan template.json langsung kelihatan. */
  let rev = 0;

  host.innerHTML = `
    <div class="admin container">
      <header class="admin__head">
        <div>
          <p class="label admin__kicker">✦ Studio frame — khusus admin</p>
          <h1 class="admin__title">Atur posisi foto frame</h1>
          <p class="admin__sub">
            Geser lubang foto, ubah ukurannya, atur kategori — semua dari sini,
            tanpa buka kode. Hasilnya langsung dipakai semua pengunjung.
          </p>
        </div>
        <div class="admin__head-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle-upload">＋ Frame baru</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle-cats">🏷 Kategori</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle-showcase">⭐ Foto homepage</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle-lb">🏆 Leaderboard</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="reload">Muat ulang daftar</button>
        </div>
      </header>

      <section class="admin__stats" data-stats aria-label="Status sistem">
        <div class="admin-stat" data-stat="server"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg></span><span class="admin-stat__label">Server</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="frames"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><rect x="7" y="6.5" width="10" height="5" rx="1.5"/><rect x="7" y="14" width="10" height="3.5" rx="1.5"/></svg></span><span class="admin-stat__label">Frame</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="stickers"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c1 1.4 2.3 2.1 3.5 2.1s2.5-.7 3.5-2.1"/><path d="M9 9.6h.01M15 9.6h.01"/></svg></span><span class="admin-stat__label">Stiker</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="filters"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5h9M19 7.5h1M4 16.5h3M13 16.5h7"/><circle cx="16" cy="7.5" r="2.4"/><circle cx="10" cy="16.5" r="2.4"/></svg></span><span class="admin-stat__label">Filter</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="music"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg></span><span class="admin-stat__label">Musik</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="gallery"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="m4.5 17.2 4.4-4.2a2 2 0 0 1 2.8 0l3.3 3.1 2.1-1.8a2 2 0 0 1 2.6 0l.8.7"/></svg></span><span class="admin-stat__label">Galeri</span><span class="admin-stat__value">…</span></div>
        <div class="admin-stat" data-stat="homepage"><span class="admin-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 11.3 12 4.2l8 7.1"/><path d="M6.4 10.2V19a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1v-8.8"/><path d="M10.4 20v-5.2h3.2V20"/></svg></span><span class="admin-stat__label">Homepage</span><span class="admin-stat__value">…</span></div>
      </section>

      <form class="admin__login panel-card" data-login hidden>
        <p class="admin__login-title">🔐 Halaman khusus developer</p>
        <p class="admin__login-hint" data-login-hint>
          Masukkan password developer untuk membuka dashboard & editor frame.
        </p>
        <div class="admin__login-row">
          <input type="password" class="admin__login-input" data-login-pw placeholder="Password admin" autocomplete="current-password" />
          <button type="submit" class="btn btn--primary">Masuk</button>
        </div>
      </form>

      <div class="admin__offline" data-offline hidden>
        <span class="admin__offline-icon" aria-hidden="true">📡</span>
        <div class="admin__offline-body">
          <b>Server belum terdeteksi.</b> Fitur edit frame butuh server Express dengan
          <code>GALLERY_ADMIN_PASSWORD</code> disetel. Jalankan
          <code>GALLERY_ADMIN_PASSWORD=rahasia npm run serve</code> (otomatis build ulang frontend),
          lalu buka lewat alamat server — misal <code>http://localhost:3000/#/admin</code>
          (bukan dev server <code>:5173</code>).
          <span class="admin__offline-detail" data-offline-detail></span>
          <span class="admin__offline-actions">
            <button type="button" class="btn btn--primary btn--sm" data-act="retry">🔄 Coba lagi</button>
          </span>
        </div>
      </div>

      <form class="admin__upload panel-card" data-cats-form hidden>
        <p class="admin__tool-title">Kelola kategori</p>
        <p class="admin__list-note">
          Tambah kategori baru, hapus yang tidak dipakai, lalu centang kategori di tiap frame —
          satu frame bisa masuk beberapa kategori sekaligus dan muncul di semuanya.
        </p>
        <div class="admin__cats-add">
          <input type="text" data-cats-new placeholder="Nama kategori baru, mis. wedding" maxlength="40" />
          <button type="submit" class="btn btn--primary btn--sm">＋ Tambah</button>
        </div>
        <div class="admin__cats-list" data-cats-list></div>
      </form>

      <section class="admin__upload panel-card" data-showcase hidden>
        <p class="admin__tool-title">⭐ Foto &amp; frame homepage</p>
        <p class="admin__list-note">
          Pilih apa yang tampil di beranda: ceklis frame template (maksimal 5) —
          kalau belum ada yang dicentang, beranda menampilkan foto galeri pilihan
          atau 5 frame terpopuler. Semua perubahan langsung aktif tanpa build ulang.
        </p>
        <div class="admin__field admin__field--wide admin__hf">
          <span>🖼️ Frame tampil di homepage — <b data-hf-count>0/${MAX_SHOWCASE_FRAMES}</b></span>
          <p class="admin__list-note">
            Ceklis frame dari katalog (bawaan developer + hasil upload). Maksimal
            ${MAX_SHOWCASE_FRAMES} frame; urutan centang = urutan tampil di beranda.
          </p>
          <div class="admin__hf-grid" data-hf-grid></div>
          <p class="admin__list-note" data-hf-empty hidden></p>
        </div>
        <div class="admin__field admin__field--wide">
          <span>Bentuk tampilan foto galeri di homepage</span>
          <div class="admin__shapes" data-shapes role="group" aria-label="Bentuk tampilan showcase"></div>
        </div>
        <div class="admin__upload-row">
          <label class="admin__field admin__field--wide"><span>Foto baru</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" data-sc-file />
          </label>
          <label class="admin__field admin__field--wide"><span>Judul foto (opsional)</span>
            <input type="text" data-sc-title placeholder="mis. Strip Imut Pink" maxlength="80" />
          </label>
          <div class="admin__field admin__field--wide admin__sc-actions">
            <button type="button" class="btn btn--primary btn--sm" data-sc-upload>⬆ Upload &amp; tampilkan</button>
            <span class="admin__list-note" data-sc-status></span>
          </div>
        </div>
        <div class="admin__sc-grid" data-sc-grid></div>
        <p class="admin__list-note" data-sc-empty hidden></p>
      </section>

      <section class="admin__upload panel-card" data-leaderboard hidden>
        <p class="admin__tool-title">🏆 Leaderboard frame</p>
        <p class="admin__list-note">
          Diurut dari frame yang paling sering dipakai pengunjung (hitung otomatis tiap
          sesi jepretan selesai). 5 teratas tampil otomatis di homepage — kecuali sudah
          ada frame yang dicentang di ⭐ Foto &amp; frame homepage.
        </p>
        <ol class="admin__lb" data-lb-list></ol>
      </section>

      <form class="admin__upload panel-card" data-upload hidden>
        <p class="admin__tool-title">Upload frame baru</p>
        <p class="admin__list-note">
          Taruh PNG transparan (area foto dibuat lubang kosong). Setelah terunggah,
          atur posisi lubang foto seperti stiker — langsung aktif tanpa build ulang.
          Kategori hanya bisa dipilih dari daftar <strong>Kelola kategori</strong> —
          upload tidak pernah membuat kategori baru.
        </p>
        <div class="admin__upload-row">
          <label class="admin__field admin__field--wide"><span>Gambar frame</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-up-file required />
          </label>
          <label class="admin__field admin__field--wide"><span>Nama frame</span>
            <input type="text" data-up-name placeholder="mis. Strip Imut Pink" required maxlength="80" />
          </label>
          <label class="admin__field"><span>Kategori</span>
            <select data-up-cat aria-label="Kategori frame (dari daftar Kelola kategori)"></select>
          </label>
          <label class="admin__field"><span>Jumlah foto</span>
            <select data-up-slots>
              <option value="1">1 foto</option>
              <option value="2">2 foto</option>
              <option value="3" selected>3 foto</option>
              <option value="4">4 foto</option>
              <option value="5">5 foto</option>
            </select>
          </label>
        </div>
        <div class="admin__slot-actions">
          <button type="submit" class="btn btn--primary btn--sm" data-up-submit>⬆ Unggah frame</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="toggle-upload">Batal</button>
        </div>
      </form>

      <div class="admin__work" data-work hidden>
        <aside class="admin__list panel-card" aria-label="Daftar frame">
          <p class="admin__list-title">Frame drop-in <span data-list-count></span></p>
          <div class="admin__cards" data-cards></div>
          <div class="admin__slot-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-act="del-frame" disabled>🗑 Hapus frame ini</button>
          </div>
          <p class="admin__list-note">
            Frame dari <code>public/booth/templates/</code>. Frame bawaan developer
            (src/data/templates.json) diedit lewat kode.
          </p>
        </aside>

        <section class="admin__editor" data-editor hidden>
          <div class="admin__bar">
            <p class="admin__bar-name" data-ed-name>—</p>
            <div class="admin__bar-actions">
              <button type="button" class="btn btn--ghost btn--sm" data-act="reset">Kembalikan seperti tersimpan</button>
              <button type="button" class="btn btn--primary" data-act="save">💾 Simpan ke server</button>
            </div>
          </div>

          <div class="admin__stage-wrap">
            <div class="admin__preview-row">
              <figure class="admin__preview">
                <span class="admin__preview-label">Preview di picker frame</span>
                <span class="admin__preview-img"><img data-thumb alt="" draggable="false" /></span>
              </figure>
              <div class="admin__preview-tools">
                <p class="admin__list-note">
                  Preview ini yang tampil di halaman <b>Pilih frame</b>. Kalau terpotong,
                  unggah gambar preview sendiri (rasio 9:16) di sini — tanpa menyentuh
                  gambar frame aslinya.
                </p>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-thumb-file hidden />
                <button type="button" class="btn btn--ghost btn--sm" data-act="thumb-upload">🖼️ Ganti preview…</button>
                <button type="button" class="btn btn--ghost btn--sm" data-act="thumb-remove">↺ Pakai frame asli</button>
                <span class="admin__list-note" data-thumb-status></span>
              </div>
            </div>
            <div class="admin__stage" data-stage>
              <img class="admin__frame" data-frame alt="" draggable="false" />
            </div>
            <p class="admin__stage-readout" data-readout aria-live="polite">—</p>
            <p class="admin__stage-hint">
              Seret lubang foto untuk memindah • seret titik sudut untuk mengubah ukuran •
              seret knob ⌃ di atas lubang untuk memutar isi foto • tahan <b>Shift</b> untuk snap 10°/10px
            </p>
          </div>

          <div class="admin__tools">
            <div class="admin__tool-card">
              <p class="admin__tool-title">Lubang foto</p>
              <div class="admin__slot-list" data-slotlist></div>
              <div class="admin__slot-actions">
                <button type="button" class="chip" data-act="addslot">＋ Tambah slot</button>
                <button type="button" class="chip" data-act="delslot">🗑 Hapus slot terpilih</button>
              </div>
              <div class="admin__slot-fields" data-slotfields>
                <label class="admin__field"><span>X</span><input type="number" data-f="x" step="1" /></label>
                <label class="admin__field"><span>Y</span><input type="number" data-f="y" step="1" /></label>
                <label class="admin__field"><span>Lebar</span><input type="number" data-f="width" step="1" min="40" /></label>
                <label class="admin__field"><span>Tinggi</span><input type="number" data-f="height" step="1" min="40" /></label>
                <label class="admin__field admin__field--wide"><span>Isi foto</span>
                  <select data-f="fit">
                    <option value="cover">Crop penuh (cover)</option>
                    <option value="contain">Muat seluruh foto (contain)</option>
                  </select>
                </label>
                <label class="admin__field"><span>Rotasi °</span><input type="number" data-f="rotation" step="1" min="-180" max="180" /></label>
                <label class="admin__field"><span>Zoom</span><input type="number" data-f="scale" step="0.05" min="0.2" max="4" /></label>
              </div>
            </div>

            <div class="admin__tool-card">
              <p class="admin__tool-title">Identitas frame</p>
              <div class="admin__slot-fields">
                <label class="admin__field admin__field--wide"><span>Nama</span><input type="text" data-t="name" /></label>
                <label class="admin__field admin__field--wide"><span>Kategori utama</span><select data-t="category"></select></label>
                <div class="admin__field admin__field--wide">
                  <span>Kategori tambahan (centang semua yang mau)</span>
                  <div class="admin__cat-checks" data-ed-cats></div>
                </div>
                <label class="admin__field admin__field--wide"><span>Deskripsi</span><input type="text" data-t="description" /></label>
                <label class="admin__field"><span>Kanvas X</span><input type="number" data-t="canvasW" step="1" min="100" /></label>
                <label class="admin__field"><span>Kanvas Y</span><input type="number" data-t="canvasH" step="1" min="100" /></label>
                <label class="admin__field"><span>Latar</span><input type="text" data-t="background" placeholder="#fffdf8" /></label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  const loginEl = host.querySelector<HTMLElement>('[data-login]')!;
  const loginHint = host.querySelector<HTMLElement>('[data-login-hint]')!;
  const offlineEl = host.querySelector<HTMLElement>('[data-offline]')!;
  const offlineDetailEl = host.querySelector<HTMLElement>('[data-offline-detail]')!;
  const workEl = host.querySelector<HTMLElement>('[data-work]')!;
  const cardsEl = host.querySelector<HTMLElement>('[data-cards]')!;
  const editorEl = host.querySelector<HTMLElement>('[data-editor]')!;
  const stageEl = host.querySelector<HTMLElement>('[data-stage]')!;
  const frameImg = host.querySelector<HTMLImageElement>('[data-frame]')!;
  const uploadEl = host.querySelector<HTMLFormElement>('[data-upload]')!;
  const statsEl = host.querySelector<HTMLElement>('[data-stats]')!;
  const catsPanelEl = host.querySelector<HTMLFormElement>('[data-cats-form]')!;
  /** Kategori global dari server (panel Kelola kategori). */
  let managedCats: string[] = [];
  /** Leaderboard pemakaian frame (dari manifest booth). */
  let lbData: BoothLeaderboardEntry[] = [];
  /** Bentuk tampilan showcase homepage yang sedang aktif. */
  let showcaseShape: string = DEFAULT_SHOWCASE_SHAPE;

  host.querySelector('[data-act="reload"]')?.addEventListener('click', () => void boot(true));
  // Panel offline: coba lagi tanpa harus menebak-nebak reload halaman.
  host.querySelector('[data-act="retry"]')?.addEventListener('click', () => {
    offlineEl.hidden = true;
    void boot();
  });
  // Bar aksi studio melekat (sticky) di bawah header — tambah bayangan saat
  // menempel supaya terlihat "terangkat" dari konten yang lewat di bawahnya.
  const barEl = host.querySelector<HTMLElement>('.admin__bar');
  const updateBarStuck = (): void => {
    if (!barEl) return;
    barEl.classList.toggle('is-stuck', barEl.getBoundingClientRect().top <= 68);
  };
  window.addEventListener('scroll', updateBarStuck, { passive: true });
  host.querySelectorAll('[data-act="toggle-upload"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uploadEl.hidden = !uploadEl.hidden;
      if (!uploadEl.hidden) uploadEl.querySelector<HTMLInputElement>('[data-up-file]')?.focus();
    });
  });

  // Panel leaderboard frame (peringkat pemakaian).
  host.querySelector('[data-act="toggle-lb"]')?.addEventListener('click', () => {
    const el = host.querySelector<HTMLElement>('[data-leaderboard]')!;
    el.hidden = !el.hidden;
    if (!el.hidden) renderLeaderboard();
  });

  // Panel kelola kategori (tambah / hapus kategori global).
  host.querySelector('[data-act="toggle-cats"]')?.addEventListener('click', () => {
    catsPanelEl.hidden = !catsPanelEl.hidden;
    if (!catsPanelEl.hidden) {
      renderCatsPanel();
      catsPanelEl.querySelector<HTMLInputElement>('[data-cats-new]')?.focus();
    }
  });

  catsPanelEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = catsPanelEl.querySelector<HTMLInputElement>('[data-cats-new]')!;
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    if (managedCats.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast(`Kategori “${name}” sudah ada.`, 'info');
      return;
    }
    void (async () => {
      try {
        managedCats = await saveBoothCategories([...managedCats, name]);
        input.value = '';
        renderCatsPanel();
        renderEditorCatChecks();
        fillCategorySelects();
        toast(`Kategori “${name}” ditambahkan ✦`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else toast(`Gagal menambah kategori: ${msg}`, 'error');
      }
    })();
  });

  /**
   * Isi select kategori (upload frame + identitas editor) HANYA dari daftar
   * "Kelola kategori" — input bebas diganti select supaya upload/edit tidak
   * bisa membuat kategori baru di luar fitur kategori.
   */
  function fillCategorySelects(): void {
    const build = (): HTMLOptionElement[] => {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '— Tanpa kategori —';
      return [
        empty,
        ...managedCats.map((c) => {
          const o = document.createElement('option');
          o.value = c;
          o.textContent = formatCat(c);
          return o;
        }),
      ];
    };
    const fill = (sel: HTMLSelectElement | null): void => {
      if (!sel) return;
      const prev = sel.value;
      sel.replaceChildren(...build());
      sel.value = managedCats.some((c) => c === prev) ? prev : '';
    };
    fill(uploadEl.querySelector<HTMLSelectElement>('[data-up-cat]'));
    fill(host.querySelector<HTMLSelectElement>('[data-t="category"]'));
  }

  function renderCatsPanel(): void {
    const list = catsPanelEl.querySelector<HTMLElement>('[data-cats-list]')!;
    const usedBy = (c: string): number => entries.filter((e) => categoriesOf(e).includes(c)).length;
    list.replaceChildren(
      ...managedCats.map((c) => {
        const row = document.createElement('div');
        row.className = 'admin__cats-row';
        const name = document.createElement('span');
        name.className = 'admin__cats-name';
        name.textContent = c;
        const count = document.createElement('span');
        count.className = 'admin__cats-count';
        const n = usedBy(c);
        count.textContent = n > 0 ? `${n} frame` : 'belum dipakai';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn--ghost btn--sm';
        del.textContent = 'Hapus';
        del.addEventListener('click', () => {
          void (async () => {
            try {
              managedCats = await saveBoothCategories(managedCats.filter((x) => x !== c));
              renderCatsPanel();
              renderEditorCatChecks();
              fillCategorySelects();
              toast(`Kategori “${c}” dihapus.`, 'info');
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg === 'unauthorized') {
                loginEl.hidden = false;
                toast('Sesi admin habis — login ulang.', 'error');
              } else toast(`Gagal hapus kategori: ${msg}`, 'error');
            }
          })();
        });
        row.append(name, count, del);
        return row;
      }),
    );
    if (managedCats.length === 0) {
      list.innerHTML = '<span class="admin__list-note">Belum ada kategori — tulis nama lalu klik Tambah.</span>';
    }
  }

  // ---- foto homepage (ceklis & upload foto untuk beranda) -----------------
  const showcaseEl = host.querySelector<HTMLElement>('[data-showcase]')!;
  const scGrid = showcaseEl.querySelector<HTMLElement>('[data-sc-grid]')!;
  const scEmpty = showcaseEl.querySelector<HTMLElement>('[data-sc-empty]')!;
  const scStatus = showcaseEl.querySelector<HTMLElement>('[data-sc-status]')!;
  let scPhotos: PublicPhoto[] = [];

  host.querySelector('[data-act="toggle-showcase"]')?.addEventListener('click', () => {
    showcaseEl.hidden = !showcaseEl.hidden;
    if (!showcaseEl.hidden) void loadShowcase();
  });

  async function loadShowcase(): Promise<void> {
    scStatus.textContent = 'Memuat foto & frame homepage…';
    // Ceklis frame homepage: katalog segar (bawaan + drop-in + hasil upload).
    await ensureHomeFrames();
    if (destroyed) return;
    const status = await fetchGalleryStatus();
    if (destroyed) return;
    if (!status) {
      scGrid.replaceChildren();
      scEmpty.hidden = false;
      scEmpty.textContent =
        'Foto galeri butuh server Express (npm run serve) dengan galeri aktif. ' +
        'Ceklis frame di atas tetap bisa dipakai — ceklis frame pilihanmu untuk tampil di beranda.';
      scStatus.textContent = `${homeFrames.length} frame tampil di homepage`;
      return;
    }
    scPhotos = await fetchPublicPhotos();
    if (destroyed) return;
    renderShowcaseGrid();
    scStatus.textContent =
      `${homeFrames.length} frame · ${scPhotos.filter((p) => p.featured).length} foto tampil di homepage`;
  }

  // ---- ceklis frame homepage (maks. 5 frame dari katalog template) ----------
  /** Id frame (TemplateDef) yang sedang dicentang tampil di beranda. */
  let homeFrames: string[] = [];
  let homeFramesLoaded = false;

  /** Ambil daftar ceklis terbaru dari manifest (sekali per sesi panel/upload). */
  async function ensureHomeFrames(): Promise<void> {
    if (homeFramesLoaded) return;
    await initCatalog({ force: true }).catch(() => undefined);
    if (destroyed) return;
    homeFrames = getBoothShowcaseFrames();
    homeFramesLoaded = true;
    renderHomeFrames();
  }

  function renderHomeFrames(): void {
    const grid = showcaseEl.querySelector<HTMLElement>('[data-hf-grid]');
    const empty = showcaseEl.querySelector<HTMLElement>('[data-hf-empty]');
    const count = showcaseEl.querySelector<HTMLElement>('[data-hf-count]');
    if (!grid || !empty || !count) return;
    count.textContent = `${homeFrames.length}/${MAX_SHOWCASE_FRAMES}`;
    const all = getEnabledTemplates();
    if (all.length === 0) {
      grid.replaceChildren();
      empty.hidden = false;
      empty.textContent = 'Belum ada frame di katalog — upload frame dulu lewat “＋ Frame baru”.';
      return;
    }
    empty.hidden = true;
    const picked = new Set(homeFrames);
    grid.replaceChildren(
      ...all.map((t) => {
        const card = document.createElement('label');
        card.className = 'sc-card hf-card' + (picked.has(t.id) ? ' is-on' : '');
        card.innerHTML = `
          <span class="hf-card__order" aria-hidden="true"></span>
          <span class="sc-card__img">
            <img alt="" loading="lazy" />
            <span class="sc-card__check" aria-hidden="true">✓</span>
          </span>
          <span class="sc-card__meta">
            <span class="sc-card__title"></span>
            <span class="sc-card__acts">
              <input type="checkbox" class="sc-card__cb" title="Tampilkan di homepage" />
            </span>
          </span>
        `;
        const img = card.querySelector<HTMLImageElement>('img')!;
        img.src = t.thumb;
        img.alt = `Frame ${t.name}`;
        card.querySelector<HTMLElement>('.sc-card__title')!.textContent =
          `${t.name} · ${t.engine.photoSlots.length} foto`;
        const order = homeFrames.indexOf(t.id);
        if (order >= 0) card.querySelector<HTMLElement>('.hf-card__order')!.textContent = String(order + 1);
        const cb = card.querySelector<HTMLInputElement>('.sc-card__cb')!;
        cb.checked = picked.has(t.id);
        cb.addEventListener('change', () => void toggleHomeFrame(t.id, cb));
        return card;
      }),
    );
  }

  /** Simpan centang frame homepage ke server (maksimal MAX_SHOWCASE_FRAMES). */
  async function toggleHomeFrame(id: string, cb: HTMLInputElement): Promise<void> {
    const on = cb.checked;
    const next = on ? [...homeFrames, id] : homeFrames.filter((x) => x !== id);
    if (on && next.length > MAX_SHOWCASE_FRAMES) {
      cb.checked = false;
      toast(`Maksimal ${MAX_SHOWCASE_FRAMES} frame — hapus centang frame lain dulu.`, 'error');
      return;
    }
    cb.disabled = true;
    try {
      homeFrames = await saveShowcaseFrames(next);
      if (destroyed) return;
      renderHomeFrames();
      const photos = scPhotos.filter((p) => p.featured).length;
      scStatus.textContent = `${homeFrames.length} frame · ${photos} foto tampil di homepage`;
      toast(
        on
          ? `Frame ditambahkan ke homepage ✦ (${homeFrames.length}/${MAX_SHOWCASE_FRAMES})`
          : 'Frame dihapus dari homepage.',
        'success',
      );
    } catch (err) {
      if (destroyed) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'unauthorized') {
        loginEl.hidden = false;
        toast('Sesi admin habis — login ulang.', 'error');
      } else toast(`Gagal menyimpan pilihan frame: ${msg}`, 'error');
      renderHomeFrames();
    } finally {
      if (!destroyed) cb.disabled = false;
    }
  }

  /**
   * Frame baru hasil upload otomatis dicentang tampil di homepage
   * (selama slotnya masih kosong — maksimal 5).
   */
  async function featureUploadedFrame(folderId: string, name: string): Promise<void> {
    await ensureHomeFrames();
    if (destroyed) return;
    const id = `booth-${folderId}`;
    if (homeFrames.includes(id) || homeFrames.length >= MAX_SHOWCASE_FRAMES) {
      if (homeFrames.length >= MAX_SHOWCASE_FRAMES && !homeFrames.includes(id)) {
        toast(
          `Homepage sudah penuh (${MAX_SHOWCASE_FRAMES} frame) — centang manual di ⭐ Foto & frame homepage.`,
          'info',
        );
      }
      renderHomeFrames();
      return;
    }
    try {
      homeFrames = await saveShowcaseFrames([...homeFrames, id]);
      if (destroyed) return;
      renderHomeFrames();
      toast(`Frame “${name}” otomatis tampil di homepage ✦ (${homeFrames.length}/${MAX_SHOWCASE_FRAMES})`, 'success');
    } catch (err) {
      if (destroyed) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'unauthorized') {
        loginEl.hidden = false;
        toast('Sesi admin habis — login ulang.', 'error');
      } else toast(`Frame terunggah, tapi gagal tampil di homepage: ${msg}`, 'error');
    }
  }

  function renderShowcaseGrid(): void {
    const featuredCount = scPhotos.filter((p) => p.featured).length;
    scStatus.textContent = `${featuredCount} foto tampil di homepage`;
    scEmpty.hidden = scPhotos.length > 0;
    if (scPhotos.length === 0) {
      scEmpty.textContent =
        'Belum ada foto di galeri — upload foto baru di atas, otomatis tampil di homepage.';
      scGrid.replaceChildren();
      return;
    }
    scGrid.replaceChildren(
      ...scPhotos.map((p) => {
        const card = document.createElement('label');
        card.className = 'sc-card' + (p.featured ? ' is-on' : '');
        card.innerHTML = `
          <span class="sc-card__img">
            <img alt="" loading="lazy" />
            <span class="sc-card__check" aria-hidden="true">✓</span>
          </span>
          <span class="sc-card__meta">
            <span class="sc-card__title"></span>
            <span class="sc-card__acts">
              <button type="button" class="sc-card__btn" data-act="rename" title="Ganti nama foto">✏️</button>
              <button type="button" class="sc-card__btn sc-card__btn--danger" data-act="del" title="Hapus dari galeri">🗑</button>
              <input type="checkbox" class="sc-card__cb" title="Tampilkan di homepage" />
            </span>
          </span>
        `;
        const img = card.querySelector<HTMLImageElement>('img')!;
        img.src = photoImageUrl(p.id);
        card.querySelector<HTMLElement>('.sc-card__title')!.textContent = p.title;
        const cb = card.querySelector<HTMLInputElement>('.sc-card__cb')!;
        cb.checked = p.featured === true;
        cb.addEventListener('change', () => void toggleFeatured(p.id, cb, card));

        // Ganti nama foto homepage (tanpa reload).
        card.querySelector('[data-act="rename"]')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const next = window.prompt('Ganti nama foto:', p.title);
          if (next === null || !next.trim()) return;
          void renamePublicPhoto(p.id, next.trim())
            .then((title) => {
              if (destroyed) return;
              scPhotos = scPhotos.map((x) => (x.id === p.id ? { ...x, title } : x));
              renderShowcaseGrid();
              toast('Nama foto diganti ✦', 'success');
            })
            .catch((err: unknown) => {
              if (destroyed) return;
              const msg = err instanceof Error ? err.message : String(err);
              if (msg === 'unauthorized') {
                loginEl.hidden = false;
                toast('Sesi admin habis — login ulang.', 'error');
              } else toast(`Gagal ganti nama: ${msg}`, 'error');
            });
        });

        // Hapus foto permanen dari galeri (otomatis hilang dari homepage).
        card.querySelector('[data-act="del"]')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!window.confirm(`Hapus foto “${p.title}” dari galeri permanen?`)) return;
          void (async () => {
            const ok = await deletePublicPhoto(p.id);
            if (destroyed) return;
            if (!ok) {
              toast('Gagal menghapus foto.', 'error');
              return;
            }
            scPhotos = await fetchPublicPhotos();
            if (destroyed) return;
            renderShowcaseGrid();
            toast('Foto dihapus.', 'success');
          })();
        });
        return card;
      }),
    );
  }

  /** Simpan pilihan ceklis ke server (ceklis = tampil di homepage). */
  async function toggleFeatured(id: string, cb: HTMLInputElement, card: HTMLElement): Promise<void> {
    const next = new Set(scPhotos.filter((p) => p.featured).map((p) => p.id));
    if (cb.checked) next.add(id);
    else next.delete(id);
    // Urutan tampil mengikuti urutan galeri.
    const ids = scPhotos.map((p) => p.id).filter((x) => next.has(x));
    cb.disabled = true;
    try {
      await setFeaturedPhotos(ids);
      if (destroyed) return;
      scPhotos = scPhotos.map((p) => ({ ...p, featured: ids.includes(p.id) }));
      card.classList.toggle('is-on', cb.checked);
      scStatus.textContent = `${ids.length} foto tampil di homepage`;
      toast(cb.checked ? 'Foto ditambahkan ke homepage ✦' : 'Foto dihapus dari homepage.', 'success');
    } catch (err) {
      if (destroyed) return;
      cb.checked = !cb.checked; // batalkan optimisme
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'unauthorized') {
        loginEl.hidden = false;
        toast('Sesi admin habis — login ulang.', 'error');
      } else toast(`Gagal menyimpan pilihan: ${msg}`, 'error');
    } finally {
      if (!destroyed) cb.disabled = false;
    }
  }

  // Upload foto baru langsung ke galeri + tandai tampil di homepage.
  showcaseEl.querySelector<HTMLButtonElement>('[data-sc-upload]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const fileInput = showcaseEl.querySelector<HTMLInputElement>('[data-sc-file]')!;
    const titleInput = showcaseEl.querySelector<HTMLInputElement>('[data-sc-title]')!;
    const file = fileInput.files?.[0];
    if (!file) {
      toast('Pilih file foto dulu.', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Mengunggah…';
    void (async () => {
      try {
        const title = titleInput.value.trim() || file.name.replace(/\.[^.]+$/, '') || 'strip';
        await uploadToGallery(file, { title, template: 'homepage', featured: true });
        if (destroyed) return;
        toast('Foto terunggah & tampil di homepage ✦', 'success');
        fileInput.value = '';
        titleInput.value = '';
        scPhotos = await fetchPublicPhotos();
        if (destroyed) return;
        renderShowcaseGrid();
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else toast(`Gagal upload foto: ${msg}`, 'error');
      } finally {
        if (!destroyed) {
          btn.disabled = false;
          btn.textContent = '⬆ Upload & tampilkan';
        }
      }
    })();
  });

  // ---- 10 bentuk tampilan showcase homepage -------------------------------
  function renderShapes(): void {
    const box = host.querySelector<HTMLElement>('[data-shapes]');
    if (!box) return;
    box.replaceChildren(
      ...SHOWCASE_SHAPES.map((s) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-shape' + (s.id === showcaseShape ? ' is-active' : '');
        btn.setAttribute('aria-pressed', String(s.id === showcaseShape));
        btn.title = s.label;
        btn.innerHTML = `<span class="sc-shape__icon" aria-hidden="true"></span><span class="sc-shape__label"></span>`;
        btn.querySelector<HTMLElement>('.sc-shape__icon')!.textContent = s.icon;
        btn.querySelector<HTMLElement>('.sc-shape__label')!.textContent = s.label;
        btn.addEventListener('click', () => void applyShape(s.id));
        return btn;
      }),
    );
  }

  async function applyShape(shape: string): Promise<void> {
    if (shape === showcaseShape) return;
    try {
      showcaseShape = await saveShowcaseShape(shape);
      if (destroyed) return;
      renderShapes();
      const label = SHOWCASE_SHAPES.find((x) => x.id === showcaseShape)?.label ?? showcaseShape;
      toast(`Bentuk “${label}” dipakai di homepage ✦`, 'success');
    } catch (err) {
      if (destroyed) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'unauthorized') {
        loginEl.hidden = false;
        toast('Sesi admin habis — login ulang.', 'error');
      } else toast(`Gagal menyimpan bentuk: ${msg}`, 'error');
    }
  }

  // ---- leaderboard frame (peringkat pemakaian) -----------------------------
  function renderLeaderboard(): void {
    const list = host.querySelector<HTMLElement>('[data-lb-list]');
    if (!list) return;
    const rows = lbData
      .map((e) => ({ e, tpl: entries.find((x) => x.id === e.id) }))
      .filter((r): r is { e: BoothLeaderboardEntry; tpl: BoothTemplateEntry } => !!r.tpl)
      .slice(0, 10);
    if (rows.length === 0) {
      list.innerHTML =
        '<li class="admin__lb-empty">Belum ada data pemakaian — hitungan terisi otomatis tiap ada pengunjung menyelesaikan jepretan.</li>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.replaceChildren(
      ...rows.map(({ e, tpl }, i) => {
        const li = document.createElement('li');
        li.className = 'admin__lb-row' + (i < 5 ? ' is-top' : '');
        li.innerHTML = `
          <span class="admin__lb-rank"></span>
          <span class="admin__lb-thumb"><img alt="" loading="lazy" /></span>
          <span class="admin__lb-meta">
            <span class="admin__lb-name"></span>
            <span class="admin__lb-cat"></span>
          </span>
          <span class="admin__lb-badge" title="5 teratas tampil otomatis di homepage">🏠 homepage</span>
          <span class="admin__lb-count"></span>
        `;
        li.querySelector<HTMLElement>('.admin__lb-rank')!.textContent = medals[i] ?? String(i + 1);
        const img = li.querySelector<HTMLImageElement>('img')!;
        img.src = tpl.thumb ?? tpl.frame;
        li.querySelector<HTMLElement>('.admin__lb-name')!.textContent = nameOf(tpl);
        const cats = categoriesOf(tpl);
        li.querySelector<HTMLElement>('.admin__lb-cat')!.textContent =
          cats.length > 0 ? cats.map(formatCat).join(', ') : 'tanpa kategori';
        li.querySelector<HTMLElement>('.admin__lb-count')!.textContent = `${e.count}×`;
        return li;
      }),
    );
  }

  // ---- login ----
  loginEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = loginEl.querySelector<HTMLInputElement>('[data-login-pw]')!;
    const pw = input.value.trim();
    if (!pw) return;
    void (async () => {
      const ok = await adminLogin(pw);
      if (destroyed) return;
      if (!ok) {
        loginHint.textContent = 'Password salah. Coba lagi.';
        loginHint.classList.add('is-error');
        return;
      }
      toast('Login admin berhasil.', 'success');
      await loadList();
    })();
  });

  /** Tampilkan panel offline lengkap dengan penyebabnya (tidak "mati tanpa keterangan"). */
  function showOffline(detail: string): void {
    offlineEl.hidden = false;
    offlineDetailEl.textContent = detail;
    workEl.hidden = true;
  }

  async function boot(force = false): Promise<void> {
    if (force) rev++;
    const status = await fetchBoothAdminStatus();
    if (destroyed) return;
    if (!status.reachable) {
      showOffline(
        'Detail: /api/booth/admin-status tidak terjangkau — kemungkinan halaman dibuka lewat dev server / alamat lain, atau server Express belum dijalankan.',
      );
      return;
    }
    if (status.authRequired) {
      // Belum login → langsung alihkan ke gerbang password (#/devlogin).
      // Setelah password benar, halaman itu membuka #/admin kembali; sesi
      // cookie HttpOnly 12 jam membuat kunjungan berikutnya langsung kebuka
      // tanpa perlu ketik password lagi (dan tanpa gerbang 7x logo).
      toast(
        status.authConfigured
          ? 'Masuk dulu dengan password developer ✦'
          : 'Server belum mengatur GALLERY_ADMIN_PASSWORD — setel dulu di server.',
        'info',
      );
      navigate('/devlogin');
      return;
    }
    await loadList();
  }

  async function loadList(): Promise<void> {
    try {
      const res = await fetch(`/api/booth?rev=${rev}`);
      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'Server membatasi permintaan (HTTP 429) — tunggu satu menit lalu tekan Coba lagi.'
            : `Server menolak permintaan (HTTP ${res.status}).`,
        );
      }
      const m = (await res.json()) as {
        templates: BoothTemplateEntry[];
        categories?: string[];
        leaderboard?: BoothLeaderboardEntry[];
        showcase?: { shape?: string };
      };
      if (destroyed) return;
      entries = m.templates;
      if (Array.isArray(m.categories)) managedCats = m.categories;
      if (Array.isArray(m.leaderboard)) lbData = m.leaderboard;
      if (typeof m.showcase?.shape === 'string') showcaseShape = m.showcase.shape;
      renderShapes();
      renderLeaderboard();
    } catch (err) {
      if (destroyed) return;
      showOffline(
        `Detail: ${err instanceof Error && err.message ? err.message : 'gagal memuat /api/booth.'}`,
      );
      return;
    }
    offlineEl.hidden = true;
    loginEl.hidden = true;
    workEl.hidden = false;
    host.querySelector<HTMLElement>('[data-list-count]')!.textContent = `(${entries.length})`;
    void loadStats(entries.length);

    // Kategori yang sudah ada → isi select upload & editor (hanya daftar resmi).
    fillCategorySelects();

    cardsEl.replaceChildren(
      ...entries.map((e) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'admin-card' + (e.id === selectedId ? ' is-selected' : '');
        card.innerHTML = `
          <span class="admin-card__thumb"><img src="${e.thumb ?? e.frame}" alt="" loading="lazy" /></span>
          <span class="admin-card__meta">
            <span class="admin-card__name"></span>
            <span class="admin-card__cat"></span>
          </span>
        `;
        card.querySelector<HTMLElement>('.admin-card__name')!.textContent = nameOf(e);
        const catsList = categoriesOf(e);
        card.querySelector<HTMLElement>('.admin-card__cat')!.textContent =
          `${catsList.length > 0 ? catsList.map(formatCat).join(', ') : 'tanpa kategori'} · ${slotCountOf(e)} slot`;
        card.addEventListener('click', () => {
          selectEntry(e.id);
          if (delBtn) delBtn.disabled = false;
        });
        return card;
      }),
    );

    if (delBtn) delBtn.disabled = !entries.some((x) => x.id === selectedId);

    if (!entries.some((e) => e.id === selectedId) && entries.length > 0) {
      selectEntry(entries[0]!.id);
    } else if (selectedId) {
      renderEditor();
    }
  }

  function nameOf(e: BoothTemplateEntry): string {
    const cfg = (e.config ?? {}) as { name?: unknown };
    return typeof cfg.name === 'string' && cfg.name.trim()
      ? cfg.name.trim()
      : e.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function categoryOf(e: BoothTemplateEntry): string {
    const cfg = (e.config ?? {}) as { category?: unknown };
    return typeof cfg.category === 'string' && cfg.category.trim()
      ? cfg.category.trim()
      : e.category ?? '';
  }

  /** Semua kategori frame (config.categories; fallback category tunggal). */
  function categoriesOf(e: BoothTemplateEntry): string[] {
    const cfg = (e.config ?? {}) as { categories?: unknown };
    const cats = Array.isArray(cfg.categories)
      ? cfg.categories.filter((c): c is string => typeof c === 'string' && !!c.trim())
      : [];
    const fallback = categoryOf(e);
    return cats.length > 0 ? [...new Set(cats)] : fallback ? [fallback] : [];
  }

  function slotCountOf(e: BoothTemplateEntry): number {
    const cfg = (e.config ?? {}) as { photoSlots?: unknown };
    if (Array.isArray(cfg.photoSlots) && cfg.photoSlots.length > 0) return Math.min(5, cfg.photoSlots.length);
    return e.slots ?? 3;
  }

  /**
   * Kategori yang bisa dipilih di editor: HANYA daftar "Kelola kategori".
   * Kategori di luar daftar (sisa nama folder lama) tidak ditawarkan dan
   * dibuang dari draft — kategori baru hanya lewat panel 🏷 Kategori.
   */
  function collectCategories(): string[] {
    return [...new Set(managedCats.map((c) => c.trim()).filter(Boolean))].sort();
  }

  function formatCat(raw: string): string {
    return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Bangun draft edit dari manifest entry (config lama + default). */
  function draftFrom(e: BoothTemplateEntry): Draft {
    const cfg = (e.config ?? {}) as Record<string, unknown>;
    const canvas = (cfg.canvas ?? {}) as { width?: unknown; height?: unknown };
    const canvasW = numberOr(canvas.width, 1080);
    const canvasH = numberOr(canvas.height, 1920);

    let slots: EditSlot[] = [];
    if (Array.isArray(cfg.photoSlots) && cfg.photoSlots.length > 0) {
      slots = cfg.photoSlots
        .map((s) => s as Record<string, unknown>)
        .map((s, i) => ({
          x: numberOr(s.x, 0),
          y: numberOr(s.y, 0),
          width: Math.max(MIN_SLOT, numberOr(s.width, 100)),
          height: Math.max(MIN_SLOT, numberOr(s.height, 100)),
          fit: s.fit === 'contain' ? ('contain' as const) : ('cover' as const),
          rotation: clamp(numberOr(s.rotation, 0), -180, 180),
          scale: Math.min(4, Math.max(0.2, numberOr(s.scale, 1))),
          photoIndex: numberOr(s.photoIndex, i),
        }))
        .sort((a, b) => a.photoIndex - b.photoIndex)
        .map(({ photoIndex: _p, ...rest }) => rest);
    } else {
      slots = defaultSlots(e.slots ?? 3, canvasW, canvasH).map((s) => ({
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        fit: 'cover' as const,
        rotation: 0,
        scale: 1,
      }));
    }

    // Hanya kategori dari daftar "Kelola kategori" yang dipakai — nilai lama
    // di luar daftar (mis. bekas nama folder frame) dibuang saat frame diedit.
    const managed = new Set(managedCats.map((c) => c.trim().toLowerCase()));
    const cats = categoriesOf(e).filter((c) => managed.has(c.trim().toLowerCase()));
    const primaryRaw = categoryOf(e);
    const primary = managed.has(primaryRaw.trim().toLowerCase()) ? primaryRaw : cats[0] ?? '';

    return {
      name: nameOf(e),
      category: primary,
      categories: cats,
      description:
        typeof cfg.description === 'string' ? cfg.description : 'Drop-in frame dari public/booth/templates.',
      canvasW,
      canvasH,
      background: typeof cfg.background === 'string' ? cfg.background : '#fffdf8',
      slots,
    };
  }

  function numberOr(v: unknown, d: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  }

  function selectEntry(id: string): void {
    selectedId = id;
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    draft = draftFrom(e);
    selectedSlot = 0;
    cardsEl.querySelectorAll('.admin-card').forEach((el, i) => {
      el.classList.toggle('is-selected', entries[i]?.id === id);
    });
    renderEditor();
  }

  // ---- editor ----

  /**
   * Samakan rasio kanvas dengan rasio gambar frame aslinya.
   * Kalau beda (mis. canvas 1080×1920 tapi frame-nya persegi/landscape),
   * frame jadi gepeng. Kita sesuaikan 1 dimensi + skala posisi slot
   * secara proporsional, jadi settingan lama tetap masuk akal.
   */
  function fitCanvasToFrameImage(): void {
    if (!draft) return;
    const nw = frameImg.naturalWidth;
    const nh = frameImg.naturalHeight;
    if (!nw || !nh) return;
    const imgAspect = nw / nh;
    const curAspect = draft.canvasW / draft.canvasH;
    if (Math.abs(curAspect - imgAspect) / imgAspect < 0.02) return; // sudah pas

    const oldW = draft.canvasW;
    const oldH = draft.canvasH;
    if (imgAspect > curAspect) {
      // gambar lebih “melebar” → pertahankan lebar, tinggi menyesuaikan
      draft.canvasH = Math.max(100, Math.round(oldW / imgAspect));
    } else {
      // gambar lebih “tinggi” → pertahankan tinggi, lebar menyesuaikan
      draft.canvasW = Math.max(100, Math.round(oldH * imgAspect));
    }
    const fx = draft.canvasW / oldW;
    const fy = draft.canvasH / oldH;
    draft.slots = draft.slots.map((s) => ({
      ...s,
      x: s.x * fx,
      y: s.y * fy,
      width: s.width * fx,
      height: s.height * fy,
    }));
    layoutBoxes();
    syncFields();
    toast(
      `Kanvas disesuaikan ke ukuran frame (${draft.canvasW}×${draft.canvasH}px). Simpan untuk mengunci.`,
      'info',
    );
  }

  function renderEditor(): void {
    if (!draft) return;
    editorEl.hidden = false;
    frameImg.onload = fitCanvasToFrameImage;
    const entry = entries.find((e) => e.id === selectedId);
    frameImg.src = `${entry?.frame ?? ''}?rev=${rev}`;
    // Preview picker: thumb kustom kalau ada, kalau tidak pakai frame asli.
    const thumbImg = host.querySelector<HTMLImageElement>('[data-thumb]');
    if (thumbImg) thumbImg.src = `${entry?.thumb ?? entry?.frame ?? ''}?rev=${rev}`;
    const status = host.querySelector<HTMLElement>('[data-thumb-status]');
    if (status) status.textContent = entry?.thumb ? 'Preview kustom dipakai.' : 'Preview = gambar frame asli.';
    host.querySelector<HTMLElement>('[data-ed-name]')!.textContent = `“${draft.name}”`;
    renderBoxes();
    renderSlotList();
    syncFields();
  }

  function layoutBoxes(): void {
    const d = draft;
    if (!d) return;
    const boxes = stageEl.querySelectorAll<HTMLElement>('.admin-slot');
    d.slots.forEach((s, i) => {
      const b = boxes[i];
      if (!b) return;
      b.style.left = `${(s.x / d.canvasW) * 100}%`;
      b.style.top = `${(s.y / d.canvasH) * 100}%`;
      b.style.width = `${(s.width / d.canvasW) * 100}%`;
      b.style.height = `${(s.height / d.canvasH) * 100}%`;
      // Lubang slot TIDAK ikut dirotasi — di render asli yang miring adalah
      // isi foto di dalam lubang, bukan lubangnya. Isi yang diputar digambar
      // di elemen terpisah supaya preview = hasil akhir.
      b.style.setProperty('--slot-rot', `${s.rotation}deg`);
      b.style.setProperty('--slot-zoom', String(s.scale));
      b.classList.toggle('is-rotated', s.rotation !== 0 || s.scale !== 1);
    });
    updateReadout();
  }

  /** Angka presisi posisi/ukuran slot terpilih — tampil live di bawah stage. */
  function updateReadout(): void {
    const el = host.querySelector<HTMLElement>('[data-readout]');
    if (!el) return;
    const s = draft?.slots[selectedSlot];
    if (!draft || !s) {
      el.textContent = '—';
      return;
    }
    const parts = [
      `Foto ${selectedSlot + 1}`,
      `x ${Math.round(s.x)}`,
      `y ${Math.round(s.y)}`,
      `${Math.round(s.width)}×${Math.round(s.height)}`,
    ];
    if (s.rotation) parts.push(`rot ${Math.round(s.rotation)}°`);
    if (s.scale !== 1) parts.push(`zoom ${s.scale.toFixed(2)}×`);
    el.textContent = parts.join('  ·  ');
  }

  function renderBoxes(): void {
    if (!draft) return;
    stageEl.querySelectorAll('.admin-slot').forEach((b) => b.remove());
    draft.slots.forEach((_s, i) => {
      const box = document.createElement('div');
      box.className = 'admin-slot' + (i === selectedSlot ? ' is-selected' : '');
      box.dataset.slot = String(i);
      box.innerHTML = `
        <span class="admin-slot__label">Foto ${i + 1}</span>
        <span class="admin-slot__fill" aria-hidden="true"></span>
        <i class="admin-slot__h admin-slot__h--nw" data-h="nw"></i>
        <i class="admin-slot__h admin-slot__h--ne" data-h="ne"></i>
        <i class="admin-slot__h admin-slot__h--sw" data-h="sw"></i>
        <i class="admin-slot__h admin-slot__h--se" data-h="se"></i>
        <i class="admin-slot__rot" data-rot title="Seret untuk memutar"></i>
      `;
      box.addEventListener('pointerdown', (e) => onSlotPointer(e, i, null));
      box.querySelectorAll<HTMLElement>('[data-h]').forEach((h) => {
        h.addEventListener('pointerdown', (e) => onSlotPointer(e, i, h.dataset.h ?? 'se'));
      });
      box.querySelector<HTMLElement>('[data-rot]')?.addEventListener('pointerdown', (e) => onSlotRotate(e, i));
      stageEl.appendChild(box);
    });
    layoutBoxes();
  }

  type SlotDrag = { index: number; corner: string | null; startX: number; startY: number; orig: EditSlot };

  /** Drag knob ⌟ = putar lubang foto mengikuti sudut mouse terhadap pusat slot. */
  function onSlotRotate(e: PointerEvent, index: number): void {
    if (!draft) return;
    e.preventDefault();
    e.stopPropagation();
    selectedSlot = index;
    stageEl.querySelectorAll<HTMLElement>('.admin-slot').forEach((b, i) => {
      b.classList.toggle('is-selected', i === index);
    });
    renderSlotList();
    syncFields();

    const slot = draft.slots[index]!;
    // Pusat rotasi dihitung dari rect GAMBAR FRAME (bukan stage) — sama
    // persis dengan pemetaan pointer saat drag, jadi knob putar tidak
    // pernah meleset walau stage punya border/padding.
    const rect = frameImg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cx = rect.left + ((slot.x + slot.width / 2) / draft.canvasW) * rect.width;
    const cy = rect.top + ((slot.y + slot.height / 2) / draft.canvasH) * rect.height;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    const origRot = slot.rotation;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    stageEl.classList.add('is-dragging');

    const move = (ev: PointerEvent): void => {
      if (!draft) return;
      const cur = draft.slots[index]!;
      const angle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      let deg = origRot + (angle - startAngle);
      // Normalize ke -180..180 biar tidak pernah lebih dari satu putaran penuh.
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      // Shift = snap 10° (bulat, gampang diulang).
      cur.rotation = ev.shiftKey ? Math.round(deg / 10) * 10 : Math.round(deg);
      layoutBoxes();
      syncFields(true);
    };
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      stageEl.classList.remove('is-dragging');
      // Selesai putar: sinkron penuh sekali (identitas + kategori ikut rapi).
      syncFields();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  function toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = frameImg.getBoundingClientRect();
    if (!draft || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * draft.canvasW,
      y: ((e.clientY - rect.top) / rect.height) * draft.canvasH,
    };
  }

  function onSlotPointer(e: PointerEvent, index: number, corner: string | null): void {
    if (!draft) return;
    e.preventDefault();
    e.stopPropagation();
    selectedSlot = index;
    stageEl.querySelectorAll<HTMLElement>('.admin-slot').forEach((b, i) => {
      b.classList.toggle('is-selected', i === index);
    });
    renderSlotList();
    syncFields();

    const orig = { ...draft.slots[index]! };
    const start = toCanvas(e);
    const drag: SlotDrag = { index, corner, startX: start.x, startY: start.y, orig };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    stageEl.classList.add('is-dragging');

    const move = (ev: PointerEvent): void => {
      if (!draft) return;
      const p = toCanvas(ev);
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const s = draft.slots[drag.index]!;
      // Shift = snap presisi 10px (geser & resize), biar posisi mudah pas.
      const snap = (v: number): number => (ev.shiftKey ? Math.round(v / 10) * 10 : Math.round(v));
      if (drag.corner === null) {
        s.x = clamp(snap(orig.x + dx), 0, draft.canvasW - s.width);
        s.y = clamp(snap(orig.y + dy), 0, draft.canvasH - s.height);
      } else {
        let x = orig.x;
        let y = orig.y;
        let w = orig.width;
        let h = orig.height;
        if (drag.corner.includes('e')) w = Math.max(MIN_SLOT, snap(orig.width + dx));
        if (drag.corner.includes('s')) h = Math.max(MIN_SLOT, snap(orig.height + dy));
        if (drag.corner.includes('w')) {
          w = Math.max(MIN_SLOT, snap(orig.width - dx));
          x = orig.x + orig.width - w;
        }
        if (drag.corner.includes('n')) {
          h = Math.max(MIN_SLOT, snap(orig.height - dy));
          y = orig.y + orig.height - h;
        }
        s.x = clamp(x, 0, draft.canvasW - MIN_SLOT);
        s.y = clamp(y, 0, draft.canvasH - MIN_SLOT);
        s.width = Math.min(w, draft.canvasW - s.x);
        s.height = Math.min(h, draft.canvasH - s.y);
      }
      layoutBoxes();
      syncFields(true);
    };
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      stageEl.classList.remove('is-dragging');
      // Selesai drag: sinkron penuh sekali (identitas + kategori ikut rapi).
      syncFields();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.min(Math.max(v, min), Math.max(min, max));
  }

  function renderSlotList(): void {
    if (!draft) return;
    const list = host.querySelector<HTMLElement>('[data-slotlist]')!;
    list.replaceChildren(
      ...draft.slots.map((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'admin-slot-chip' + (i === selectedSlot ? ' is-active' : '');
        b.textContent = `Foto ${i + 1}`;
        b.title = `${Math.round(s.width)}×${Math.round(s.height)} px`;
        b.addEventListener('click', () => {
          selectedSlot = i;
          stageEl.querySelectorAll<HTMLElement>('.admin-slot').forEach((el, j) => {
            el.classList.toggle('is-selected', j === i);
          });
          renderSlotList();
          syncFields();
        });
        return b;
      }),
    );
  }

  /**
   * Sinkronkan input angka (slot & identitas) dengan draft.
   * `light` = versi murah untuk dipanggil tiap gerakan drag: hanya angka
   * slot terpilih + readout — TIDAK menyentuh panel identitas/kategori
   * (dulu tiap pointermove membangun ulang checkbox kategori = lag/delay).
   */
  function syncFields(light = false): void {
    if (!draft) return;
    const s = draft.slots[selectedSlot];
    const fields = host.querySelector<HTMLElement>('[data-slotfields]')!;
    fields.toggleAttribute('disabled', !s);
    fields.classList.toggle('is-disabled', !s);
    if (s) {
      (['x', 'y', 'width', 'height'] as const).forEach((k) => {
        const input = fields.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
        if (input && document.activeElement !== input) input.value = String(Math.round(s[k]));
      });
      const rotInput = fields.querySelector<HTMLInputElement>('[data-f="rotation"]');
      if (rotInput && document.activeElement !== rotInput) rotInput.value = String(Math.round(s.rotation));
      const scaleInput = fields.querySelector<HTMLInputElement>('[data-f="scale"]');
      if (scaleInput && document.activeElement !== scaleInput) scaleInput.value = String(Number(s.scale.toFixed(2)));
      const fit = fields.querySelector<HTMLSelectElement>('[data-f="fit"]');
      if (fit) fit.value = s.fit;
    }
    updateReadout();
    if (light) return;
    const setT = (k: string, v: string | number): void => {
      const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-t="${k}"]`);
      if (input && document.activeElement !== input) input.value = String(v);
    };
    setT('name', draft.name);
    setT('category', draft.category);
    setT('description', draft.description);
    setT('canvasW', draft.canvasW);
    setT('canvasH', draft.canvasH);
    setT('background', draft.background);
    renderEditorCatChecks();
  }

  /** Checkbox "frame ini masuk kategori mana aja" di editor. */
  function renderEditorCatChecks(): void {
    const box = host.querySelector<HTMLElement>('[data-ed-cats]');
    if (!box || !draft) return;
    const cats = collectCategories();
    box.replaceChildren(
      ...cats.map((c) => {
        const label = document.createElement('label');
        label.className = 'admin__cat-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = draft!.categories.includes(c);
        cb.addEventListener('change', () => {
          if (!draft) return;
          if (cb.checked) {
            if (!draft.categories.includes(c)) draft.categories.push(c);
          } else {
            draft.categories = draft.categories.filter((x) => x !== c);
          }
          if (draft.categories.length > 0) draft.category = draft.categories[0]!;
          const catInput = host.querySelector<HTMLSelectElement>('[data-t="category"]');
          if (catInput) catInput.value = draft.category;
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(formatCat(c)));
        return label;
      }),
    );
    if (cats.length === 0) box.innerHTML = '<span class="admin__list-note">Belum ada kategori — tambahkan dulu di panel Kategori.</span>';
  }

  // Slot numeric fields
  host.querySelectorAll<HTMLInputElement>('[data-slotfields] [data-f]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!draft) return;
      const s = draft.slots[selectedSlot];
      if (!s) return;
      const key = input.dataset.f;
      if (key === 'fit') {
        s.fit = input.value === 'contain' ? 'contain' : 'cover';
        return;
      }
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      if (key === 'x') s.x = clamp(v, 0, draft.canvasW - s.width);
      else if (key === 'y') s.y = clamp(v, 0, draft.canvasH - s.height);
      else if (key === 'width') s.width = Math.min(Math.max(v, MIN_SLOT), draft.canvasW - s.x);
      else if (key === 'height') s.height = Math.min(Math.max(v, MIN_SLOT), draft.canvasH - s.y);
      else if (key === 'rotation') s.rotation = Math.round(clamp(v, -180, 180));
      else if (key === 'scale') s.scale = Math.min(4, Math.max(0.2, v));
      layoutBoxes();
    });
  });

  // Identitas fields (teks + select kategori utama)
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-t]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!draft) return;
      const key = input.dataset.t;
      if (key === 'name') draft.name = input.value.trim() || draft.name;
      else if (key === 'category') {
        // Pilihan hanya dari daftar kategori — kosong = tanpa kategori.
        draft.category = input.value.trim();
        draft.categories = draft.category ? [draft.category] : [];
        renderEditorCatChecks();
      }
      else if (key === 'description') draft.description = input.value;
      else if (key === 'background') draft.background = input.value.trim() || '#fffdf8';
      else if (key === 'canvasW') {
        const v = Number(input.value);
        if (Number.isFinite(v) && v >= 100) draft.canvasW = Math.round(v);
      } else if (key === 'canvasH') {
        const v = Number(input.value);
        if (Number.isFinite(v) && v >= 100) draft.canvasH = Math.round(v);
      }
      host.querySelector<HTMLElement>('[data-ed-name]')!.textContent = `“${draft.name}”`;
    });
  });

  host.querySelector('[data-act="addslot"]')?.addEventListener('click', () => {
    if (!draft) return;
    if (draft.slots.length >= 5) {
      toast('Satu frame maksimal 5 slot.', 'info');
      return;
    }
    const n = draft.slots.length + 1;
    const def = defaultSlots(n, draft.canvasW, draft.canvasH);
    const slot = def[n - 1]!;
    draft.slots.push({ x: slot.x, y: slot.y, width: slot.width, height: slot.height, fit: 'cover', rotation: 0, scale: 1 });
    selectedSlot = n - 1;
    renderBoxes();
    renderSlotList();
    syncFields();
  });

  host.querySelector('[data-act="delslot"]')?.addEventListener('click', () => {
    if (!draft) return;
    if (draft.slots.length <= 1) {
      toast('Frame minimal punya 1 slot.', 'info');
      return;
    }
    draft.slots.splice(selectedSlot, 1);
    selectedSlot = Math.max(0, selectedSlot - 1);
    renderBoxes();
    renderSlotList();
    syncFields();
  });

  // ---- ganti preview frame (thumb) dari editor ----
  const thumbFileInput = host.querySelector<HTMLInputElement>('[data-thumb-file]');
  host.querySelector('[data-act="thumb-upload"]')?.addEventListener('click', () => {
    if (!selectedId) return;
    thumbFileInput?.click();
  });
  thumbFileInput?.addEventListener('change', () => {
    const file = thumbFileInput.files?.[0];
    thumbFileInput.value = '';
    if (!file || !selectedId) return;
    const status = host.querySelector<HTMLElement>('[data-thumb-status]');
    if (status) status.textContent = 'Mengunggah preview…';
    void (async () => {
      try {
        await uploadBoothThumb(selectedId, file);
        if (destroyed) return;
        rev++;
        await loadList();
        selectEntry(selectedId);
        toast('Preview frame diganti ✦', 'success');
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else toast(`Gagal ganti preview: ${msg}`, 'error');
        if (status) status.textContent = '';
      }
    })();
  });
  host.querySelector('[data-act="thumb-remove"]')?.addEventListener('click', () => {
    if (!selectedId) return;
    void (async () => {
      try {
        await removeBoothThumb(selectedId);
        if (destroyed) return;
        rev++;
        await loadList();
        selectEntry(selectedId);
        toast('Preview kembali memakai frame asli.', 'success');
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else toast(`Gagal hapus preview: ${msg}`, 'error');
      }
    })();
  });

  host.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
    const e = entries.find((x) => x.id === selectedId);
    if (!e || !draft) return;
    draft = draftFrom(e);
    selectedSlot = 0;
    renderEditor();
    toast('Draft dikembalikan ke data tersimpan.', 'info');
  });

  // Hapus frame drop-in beserta foldernya (permanen).
  const delBtn = host.querySelector<HTMLButtonElement>('[data-act="del-frame"]');
  delBtn?.addEventListener('click', () => {
    if (!selectedId) return;
    const e = entries.find((x) => x.id === selectedId);
    const label = e ? nameOf(e) : selectedId;
    if (!confirm(`Hapus frame “${label}” beserta semua filenya? Tindakan ini permanen.`)) return;
    delBtn.disabled = true;
    void (async () => {
      try {
        await deleteBoothTemplate(selectedId);
        if (destroyed) return;
        toast(`Frame “${label}” dihapus.`, 'success');
        selectedId = '';
        draft = null;
        editorEl.hidden = true;
        rev++;
        await loadList();
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else toast(`Gagal menghapus frame: ${msg}`, 'error');
      } finally {
        if (!destroyed) delBtn.disabled = false;
      }
    })();
  });

  host.querySelector('[data-act="save"]')?.addEventListener('click', () => {
    if (!draft || !selectedId) return;
    const patch = {
      name: draft.name,
      category: draft.category,
      categories: draft.categories.length ? draft.categories : draft.category ? [draft.category] : [],
      description: draft.description,
      canvas: { width: Math.round(draft.canvasW), height: Math.round(draft.canvasH) },
      background: draft.background,
      photoSlots: draft.slots.map((s, i) => ({
        photoIndex: i,
        x: Math.round(s.x),
        y: Math.round(s.y),
        width: Math.round(s.width),
        height: Math.round(s.height),
        ...(s.fit === 'contain' ? { fit: 'contain' as const } : {}),
        ...(s.rotation ? { rotation: s.rotation } : {}),
        ...(s.scale !== 1 ? { scale: Number(s.scale.toFixed(2)) } : {}),
      })),
    };
    void (async () => {
      try {
        await saveBoothTemplateConfig(selectedId, patch);
        if (destroyed) return;
        toast('Tersimpan ✦ — semua pengunjung langsung memakai settingan baru.', 'success');
        rev++;
        await loadList();
        selectEntry(selectedId);
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else {
          toast(`Gagal menyimpan: ${msg}`, 'error');
        }
      }
    })();
  });

  // ---- upload frame baru ----
  uploadEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const fileInput = uploadEl.querySelector<HTMLInputElement>('[data-up-file]')!;
    const nameInput = uploadEl.querySelector<HTMLInputElement>('[data-up-name]')!;
    const catInput = uploadEl.querySelector<HTMLSelectElement>('[data-up-cat]')!;
    const slotsInput = uploadEl.querySelector<HTMLSelectElement>('[data-up-slots]')!;
    const submitBtn = uploadEl.querySelector<HTMLButtonElement>('[data-up-submit]')!;
    const file = fileInput.files?.[0];
    const name = nameInput.value.trim();
    if (!file) {
      toast('Pilih file gambar frame dulu.', 'error');
      return;
    }
    if (!name) {
      toast('Nama frame wajib diisi.', 'error');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengunggah…';
    void (async () => {
      try {
        const newId = await uploadBoothFrame(file, {
          name,
          category: catInput.value.trim() || undefined,
          slots: Number(slotsInput.value) || 3,
        });
        if (destroyed) return;
        toast(`Frame “${name}” terunggah ✦`, 'success');
        uploadEl.reset();
        uploadEl.hidden = true;
        rev++;
        await loadList();
        selectEntry(newId);
        // Frame baru langsung dicentang tampil di homepage (kalau slot masih ada).
        await featureUploadedFrame(newId, name);
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'unauthorized') {
          loginEl.hidden = false;
          toast('Sesi admin habis — login ulang.', 'error');
        } else {
          toast(`Gagal mengunggah: ${msg}`, 'error');
        }
      } finally {
        if (!destroyed) {
          submitBtn.disabled = false;
          submitBtn.textContent = '⬆ Unggah frame';
        }
      }
    })();
  });

  // ---- dashboard status ----
  function setStat(key: string, value: string): void {
    const el = statsEl.querySelector<HTMLElement>(`[data-stat="${key}"] .admin-stat__value`);
    if (el) el.textContent = value;
  }

  async function loadStats(entriesCount: number): Promise<void> {
    statsEl.hidden = false;

    // Server: healthz (butuh Express; di dev vite dianggap "dev").
    try {
      const res = await fetch('/healthz');
      if (res.ok) {
        const data = (await res.json()) as { uptime?: number };
        setStat('server', `● aktif · ${fmtUptime(data.uptime ?? 0)}`);
        statsEl.querySelector('[data-stat="server"]')?.classList.add('is-ok');
      } else throw new Error('down');
    } catch {
      setStat('server', '○ mode dev (vite)');
    }

    setStat('frames', `${entriesCount} frame`);

    // Manifest booth → stiker & filter + jumlah frame homepage terpilih.
    let homeFrameCount = 0;
    try {
      const res = await fetch('/api/booth');
      if (res.ok) {
        const m = (await res.json()) as {
          stickers?: BoothStickerEntry[];
          filters?: BoothFilterEntry[];
          showcase?: { frames?: string[] };
        };
        setStat('stickers', `${m.stickers?.length ?? 0} stiker`);
        setStat('filters', `${m.filters?.length ?? 0} filter`);
        homeFrameCount = Array.isArray(m.showcase?.frames) ? m.showcase.frames.length : 0;
      }
    } catch {
      /* offline */
    }

    // Musik drop-in.
    try {
      const res = await fetch('/api/music');
      if (res.ok) {
        const m = (await res.json()) as { tracks?: unknown[] };
        setStat('music', `${m.tracks?.length ?? 0} lagu`);
      }
    } catch {
      /* offline */
    }

    // Galeri publik + foto terpilih homepage.
    const gStatus = await fetchGalleryStatus();
    if (gStatus) {
      const photos = await fetchPublicPhotos();
      const drive = gStatus.driveConfigured ? ' · drive ✓' : '';
      setStat('gallery', `${photos.length} foto${drive}`);
      setStat('homepage', `${homeFrameCount} frame · ${photos.filter((p) => p.featured).length} foto`);
    } else {
      setStat('gallery', 'nonaktif');
      setStat('homepage', `${homeFrameCount} frame · foto nonaktif`);
    }
  }

  void boot();

  return () => {
    destroyed = true;
    window.removeEventListener('scroll', updateBarStuck);
  };
}
