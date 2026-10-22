import { navigate } from '../../app/router';
import { openHelpModal } from '../../components/HelpModal';

/**
 * Tutorial — fitur sendiri (route #/guide).
 * Langkah visual 1→4 + tips + pintasan keyboard, diputar dari tombol
 * "Cara pakai" di home dan tombol buku 📖 di header.
 */
const STEPS = [
  {
    n: 1,
    icon: '🖼️',
    title: 'Pilih frame',
    text: 'Buka menu Pilih Frame, lalu geser baris “Semua / 1–5 foto” dan baris kategori ke kanan–kiri untuk menyaring gaya bingkai.',
    note: 'Jumlah jepretan otomatis ngikutin slot frame — frame 4 slot = 4 jepretan, dst. Kamera berhenti sendiri saat slot penuh.',
    accent: 'pink',
  },
  {
    n: 2,
    icon: '📸',
    title: 'Jepret!',
    text: 'Kamera hidup, countdown jalan. Tiap foto langsung masuk ke slot frame. Salah? Tekan ↺ untuk mengulang foto itu saja.',
    note: 'Bisa set timer 3/5/10 detik, ganti filter live, dan nyalakan mirror biar kayak selfie.',
    accent: 'violet',
  },
  {
    n: 3,
    icon: '🎀',
    title: 'Hias foto',
    text: 'Tab Foto 1/2/3 (dst.) untuk berpindah foto. Tambah stiker, emoji, teks, sampai gambar bebas pakai pen.',
    note: 'Seret stiker untuk geser, titik sudut untuk resize, knob atas untuk muter. Tombol layer atur stiker di depan/belakang frame. Klik fotomu (atau tab Foto 1/2/3) untuk zoom, geser, dan muter foto di dalam lubang frame. Undo/redo selalu tersedia.',
    accent: 'mint',
  },
  {
    n: 4,
    icon: '💾',
    title: 'Unduh & pamer',
    text: 'Simpan hasilnya sebagai PNG (kualitas penuh) atau JPEG (file lebih kecil), lalu bagikan ke temanmu.',
    note: 'Semua diproses di browser kamu — tidak ada satu pun foto yang diunggah ke server.',
    accent: 'lemon',
  },
] as const;

const TIPS = [
  { icon: '📷', title: 'Ganti foto demo', text: 'Di preview frame ada tombol Ganti Foto Demo — tekan untuk menggeser urutan foto demo antar slot supaya pas dengan frame-mu.' },
  { icon: '⌨️', title: 'Pintasan editor', text: 'Ctrl/Cmd+Z undo · Shift+Z redo · panah untuk geser layer · Delete untuk hapus layer.' },
  { icon: '🎵', title: 'Musik latar', text: 'Piringan hitam di pojok bisa diputar/dijeda. Lagu dari folder public/music/ ikut kebaca otomatis.' },
  { icon: '💌', title: 'Mau kasih dukungan?', text: 'Klik Donasi di menu atas kalau booth ini bikin harimu sedikit lebih ceria ✦' },
];

export function mountGuidePage(host: HTMLElement): () => void {
  host.innerHTML = `
    <div class="guide container">
      <header class="guide__hero">
        <p class="label guide__kicker">✦ Tutorial lengkap</p>
        <h1 class="guide__title">Cara pakai <em>fotome</em></h1>
        <p class="guide__sub">4 langkah, kurang dari 2 menit. Baca santai sambil dengerin musik 🎧</p>
        <div class="guide__hero-actions">
          <button type="button" class="btn btn--primary btn--lg" data-start>Mulai sekarang ✦</button>
          <button type="button" class="btn btn--ghost" data-shortcuts>Lihat pintasan</button>
        </div>
      </header>

      <ol class="guide-steps">
        ${STEPS.map(
          (s) => `
          <li class="guide-step guide-step--${s.accent}">
            <span class="guide-step__num" aria-hidden="true">${s.n}</span>
            <div class="guide-step__icon" aria-hidden="true">${s.icon}</div>
            <div class="guide-step__body">
              <h2 class="guide-step__title">${s.title}</h2>
              <p class="guide-step__text">${s.text}</p>
              <p class="guide-step__note">${s.note}</p>
            </div>
          </li>`,
        ).join('')}
      </ol>

      <section class="guide__tips" aria-labelledby="guide-tips">
        <h2 class="guide__section-title" id="guide-tips">Trik biar hasilnya makin kece ✨</h2>
        <div class="tip-grid">
          ${TIPS.map(
            (t) => `
            <article class="tip-card">
              <span class="tip-card__icon" aria-hidden="true">${t.icon}</span>
              <h3 class="tip-card__title">${t.title}</h3>
              <p class="tip-card__text">${t.text}</p>
            </article>`,
          ).join('')}
        </div>
      </section>

      <section class="guide__flow" aria-labelledby="guide-flow">
        <h2 class="guide__section-title" id="guide-flow">Alurnya di layar</h2>
        <div class="guide-flow">
          ${['Pilih', 'Jepret', 'Hias', 'Unduh']
            .map(
              (label, i) => `
            <div class="guide-flow__node">
              <span class="guide-flow__dot">${i + 1}</span>
              <span class="guide-flow__label">${label}</span>
            </div>`,
            )
            .join('<span class="guide-flow__arrow" aria-hidden="true">➜</span>')}
        </div>
      </section>

      <div class="guide__cta">
        <p>Reading selesai? Saatnya bikin strip pertamamu 📸</p>
        <button type="button" class="btn btn--primary btn--lg" data-start>Mulai Fotobooth ✦</button>
      </div>
    </div>
  `;

  host.querySelectorAll<HTMLElement>('[data-start]').forEach((b) =>
    b.addEventListener('click', () => navigate('/capture')),
  );
  host.querySelector('[data-shortcuts]')?.addEventListener('click', openHelpModal);

  return () => {
    /* no listeners to clean */
  };
}
