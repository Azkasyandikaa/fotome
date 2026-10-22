import { navigate } from '../../app/router';
import { toast } from '../../components/toast';
import { adminLogin } from '../../services/cloudGallery';
import { fetchBoothAdminStatus } from '../../services/booth';

/**
 * #/devlogin — gerbang developer (langkah 2).
 * Alur: tekan logo "fotome." di header 7x → halaman ini (password) →
 * setelah password benar, baru menuju #/admin (dashboard + studio frame).
 * Di mode dev (vite tanpa server / tanpa password) halaman ini otomatis
 * meneruskan ke #/admin tanpa perlu password.
 */
export function mountDevLoginPage(host: HTMLElement): () => void {
  let destroyed = false;

  host.innerHTML = `
    <div class="devlogin">
      <section class="devlogin__card" aria-labelledby="devlogin-title">
        <span class="devlogin__badge" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><circle cx="12" cy="15.4" r="1.6"/></svg>
        </span>
        <p class="label devlogin__kicker">✦ Gerbang tersembunyi</p>
        <h1 class="devlogin__title" id="devlogin-title">Halaman <em>developer</em></h1>
        <p class="devlogin__sub" data-devlogin-sub>
          Masukkan password developer untuk membuka dashboard &amp; studio frame fotome.
        </p>

        <form class="devlogin__form" data-devlogin-form>
          <div class="devlogin__row">
            <input
              type="password"
              class="devlogin__input"
              data-devlogin-pw
              placeholder="Password developer"
              autocomplete="current-password"
              aria-label="Password developer"
            />
            <button type="button" class="devlogin__eye" data-devlogin-eye aria-label="Tampilkan password" title="Tampilkan password">
              <svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <p class="devlogin__hint" data-devlogin-hint hidden></p>
          <button type="submit" class="btn btn--primary btn--lg btn--block" data-devlogin-submit>
            Buka dashboard ✦
          </button>
        </form>

        <p class="devlogin__note" data-devlogin-loading>Memeriksa server…</p>

        <a class="devlogin__back" href="#/">← Kembali ke beranda</a>
      </section>
    </div>
  `;

  const form = host.querySelector<HTMLFormElement>('[data-devlogin-form]')!;
  const input = host.querySelector<HTMLInputElement>('[data-devlogin-pw]')!;
  const hint = host.querySelector<HTMLElement>('[data-devlogin-hint]')!;
  const note = host.querySelector<HTMLElement>('[data-devlogin-loading]')!;
  const submitBtn = host.querySelector<HTMLButtonElement>('[data-devlogin-submit]')!;
  const card = host.querySelector<HTMLElement>('.devlogin__card')!;

  const showError = (msg: string): void => {
    hint.textContent = msg;
    hint.hidden = false;
    card.classList.remove('is-shake');
    // paksa reflow supaya animasi shake bisa berulang
    void card.offsetWidth;
    card.classList.add('is-shake');
  };

  // Lihat/sembunyi password.
  host.querySelector('[data-devlogin-eye]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLElement;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
    btn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    input.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = input.value.trim();
    if (!pw) {
      showError('Password masih kosong.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memeriksa…';
    void (async () => {
      const ok = await adminLogin(pw);
      if (destroyed) return;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Buka dashboard ✦';
      if (!ok) {
        input.select();
        showError('Password salah. Coba lagi.');
        return;
      }
      toast('Password benar — membuka dashboard developer ✦', 'success');
      navigate('/admin');
    })();
  });

  // Escape = kembali ke beranda.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') navigate('/');
  };
  document.addEventListener('keydown', onKey);

  void (async () => {
    const status = await fetchBoothAdminStatus();
    if (destroyed) return;
    if (!status.authRequired) {
      // Mode dev (vite tanpa server) — tidak perlu password, langsung dashboard.
      navigate('/admin');
      return;
    }
    note.hidden = true;
    if (!status.authConfigured) {
      hint.textContent =
        'Server belum mengatur GALLERY_ADMIN_PASSWORD — setel dulu di server supaya halaman ini aman.';
      hint.hidden = false;
    }
    input.focus();
  })();

  return () => {
    destroyed = true;
    document.removeEventListener('keydown', onKey);
  };
}
