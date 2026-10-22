/** Shared modal builder: backdrop, X close, Escape, overlay click, focus trap. */

export interface ModalHandle {
  root: HTMLElement;
  close(): void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(content: HTMLElement, label: string): ModalHandle {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__header">
        <span class="modal__header-slot"></span>
        <button type="button" class="modal__close" aria-label="Tutup dialog">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal__body"></div>
    </div>
  `;
  const box = root.querySelector<HTMLElement>('.modal')!;
  box.setAttribute('aria-label', label);
  const body = root.querySelector<HTMLElement>('.modal__body')!;
  body.appendChild(content);

  // Content titles move into the dialog header (spec: header/body/footer
  // dipisah dengan border halus).
  const title = content.querySelector<HTMLElement>(':scope > .modal-title');
  const slot = root.querySelector<HTMLElement>('.modal__header-slot');
  if (title && slot) slot.replaceWith(title);

  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const previouslyFocused = document.activeElement as HTMLElement | null;

  const close = (): void => {
    root.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    root.removeEventListener('focusin', onFocusIn);
    previouslyFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Focus trap: keep Tab cycling inside the dialog.
    const nodes = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !box.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (e: FocusEvent): void => {
    if (!box.contains(e.target as Node)) {
      const first = box.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }
  };

  document.addEventListener('keydown', onKey, true);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('mousedown', (e) => {
    if (e.target === root) close();
  });
  root.querySelector<HTMLButtonElement>('.modal__close')?.addEventListener('click', close);

  // Dialog opens with focus inside.
  window.requestAnimationFrame(() => {
    const target = body.querySelector<HTMLElement>(FOCUSABLE) ?? box.querySelector<HTMLElement>('.modal__close');
    target?.focus();
  });

  return { root, close };
}
