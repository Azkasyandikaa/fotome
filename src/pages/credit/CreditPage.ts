import site from '../../data/site.json';
import { openDonationModal } from '../../components/DonationModal';

/** Developer credit page built entirely from site.json. */
export function mountCreditPage(host: HTMLElement): void {
  const d = site.developer;
  host.innerHTML = `
    <section class="credit">
      <div class="credit__grid">
        <div class="credit__card">
          <span class="credit__avatar-wrap">
            <img class="credit__avatar" src="${d.avatar}" alt="Avatar ${d.name}" width="96" height="96" />
          </span>
          <div>
            <h1 class="credit__name"></h1>
            <p class="credit__bio"></p>
            <ul class="credit__tech" aria-label="Teknologi yang dipakai"></ul>
            <div class="credit__links"></div>
          </div>
        </div>
        <aside class="credit__support">
          <h2 class="credit__support-title">Dukung booth ini ♡</h2>
          <p class="credit__support-note">
            Fotome gratis — server kecil butuh cemilan. Donasi sukarela, seikhlasnya.
          </p>
          <button type="button" class="btn btn--primary" data-donate>♡ TRAKTIR DEVELOPER</button>
        </aside>
      </div>
      <a class="credit__back" href="#/">← Kembali ke booth</a>
    </section>
  `;
  host.querySelector<HTMLElement>('.credit__name')!.textContent = d.name;
  host.querySelector<HTMLElement>('.credit__bio')!.textContent = d.bio;

  // Missing avatar file (belum ditaruh di public/assets/images/) → fallback, bukan blank.
  host.querySelector<HTMLImageElement>('.credit__avatar')?.addEventListener('error', (e) => {
    const img = e.currentTarget as HTMLImageElement;
    if (!img.src.endsWith('/assets/images/avatar.svg')) img.src = '/assets/images/avatar.svg';
  });

  host.querySelector<HTMLElement>('.credit__tech')!.replaceChildren(
    ...d.tech.map((t) => {
      const li = document.createElement('li');
      li.className = 'credit__tech-item';
      li.textContent = t;
      return li;
    }),
  );

  host.querySelector<HTMLElement>('.credit__links')!.replaceChildren(
    ...d.links.map((l) => {
      const a = document.createElement('a');
      a.className = 'btn btn--ghost btn--sm';
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = l.label;
      return a;
    }),
  );

  host.querySelector('[data-donate]')?.addEventListener('click', openDonationModal);
}
