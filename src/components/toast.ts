/** Lightweight toast — spec §6.4: icon + text (never colour alone), 3s default. */

export type ToastKind = 'success' | 'error' | 'info';

const ICONS: Record<ToastKind, string> = {
  success: '<path d="m5 12 5 5L20 7"/>',
  error: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<path d="M12 16v-5M12 8h.01"/><circle cx="12" cy="12" r="9"/>',
};

let container: HTMLDivElement | null = null;

export function toast(message: string, kind: ToastKind = 'info'): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    container.addEventListener('click', () => {
      container?.classList.remove('is-visible');
    });
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.innerHTML = `<span class="toast__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[kind]}</svg></span>`;
  el.append(document.createTextNode(message));
  container.replaceChildren(el);
  requestAnimationFrame(() => container?.classList.add('is-visible'));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    container?.classList.remove('is-visible');
    window.setTimeout(() => {
      if (container && !container.classList.contains('is-visible')) container.replaceChildren();
    }, 300);
  }, 3000);
}

let toastTimer = 0;
