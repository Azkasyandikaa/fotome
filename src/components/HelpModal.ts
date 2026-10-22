import { openModal } from './modal';

/** Bantuan singkat dari tombol "?" di header (spec §4.3). */
export function openHelpModal(): void {
  const content = document.createElement('div');
  content.className = 'help';
  content.innerHTML = `
    <h2 class="modal-title">Cara pakai Fotome</h2>
    <ol class="help__list">
      <li><strong>Pilih frame</strong> di halaman Pilih Frame (filter slot 1–5 foto + baris kategori yang bisa digulir kanan–kiri).</li>
      <li><strong>Foto</strong> — countdown berjalan, foto sesuai jumlah slot frame. Bisa diulang per foto, timer 3/5/10 detik bisa diatur.</li>
      <li><strong>Edit</strong> — tambah stiker, teks, gambar, dan gambar bebas (pen). Atur urutan stiker (maju/mundur) serta posisinya di depan/belakang frame.</li>
      <li><strong>Unduh</strong> — pilih PNG atau JPEG, simpan ke perangkatmu.</li>
    </ol>
    <p class="help__note">
      Foto diproses langsung di browser kamu (Canvas API). Tidak ada foto yang dikirim
      ke server — server hanya menyajikan file statis.
    </p>
    <p class="help__shortcuts">
      Pintasan: <kbd>Ctrl/Cmd + Z</kbd> undo · <kbd>Shift + Z</kbd> redo ·
      <kbd>← ↑ → ↓</kbd> geser layer · <kbd>Delete</kbd> hapus layer.
    </p>
    <button type="button" class="btn btn--primary btn--block" data-close>Mengerti</button>
  `;

  const modal = openModal(content, 'Bantuan Fotome');
  content.querySelector('[data-close]')?.addEventListener('click', modal.close);
}
