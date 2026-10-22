import type { PageId } from './state';

type PageFactory = (host: HTMLElement) => void | (() => void);

interface Route {
  path: string;
  id: PageId;
  factory: PageFactory;
}

const routes: Route[] = [];
let appHost: HTMLElement | null = null;
let teardown: (() => void) | null = null;
let currentPath = '';

export function initRouter(host: HTMLElement): void {
  appHost = host;
  window.addEventListener('hashchange', () => void handleRoute());
  void handleRoute();
}

export function registerPage(path: string, id: PageId, factory: PageFactory): void {
  routes.push({ path, id, factory });
}

export function navigate(path: string): void {
  if (normalize(path) === currentPath) return;
  window.location.hash = '#' + normalize(path);
}

function normalize(p: string): string {
  return p === '/' || p === '' ? '/' : p.replace(/\/+$/, '');
}

function currentHashPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return normalize(h || '/');
}

async function handleRoute(): Promise<void> {
  if (!appHost) return;
  const path = currentHashPath();
  const route = routes.find((r) => r.path === path) ?? routes.find((r) => r.path === '*');
  if (!route) return;

  // Play the page-exit animation first (skipped on the very first render).
  if (currentPath) {
    appHost.classList.add('page-exit');
    await waitForAnimation(appHost);
  }

  teardown?.();
  teardown = null;
  currentPath = path;
  store.set('page', route.id);
  appHost.classList.remove('page-exit');
  appHost.replaceChildren();
  const result = route.factory(appHost);
  teardown = typeof result === 'function' ? result : null;
  window.scrollTo(0, 0);

  // Fresh content enters with the page-enter animation.
  appHost.classList.add('page-enter');
  const clear = (): void => {
    appHost?.classList.remove('page-enter', 'page-leave');
  };
  waitForAnimation(appHost).then(clear);
  // Safety net in case animationend never fires (reduced motion, hidden tab).
  window.setTimeout(clear, 800);
}

/** Resolves when the element's animation ends (immediately if none is running). */
function waitForAnimation(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return resolve();
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', finish);
      el.removeEventListener('animationcancel', finish);
      resolve();
    };
    el.addEventListener('animationend', finish, { once: true });
    el.addEventListener('animationcancel', finish, { once: true });
    // Fallback: animation may not run at all (display:none, interrupted, etc.).
    window.setTimeout(finish, 450);
  });
}

// Kept in a function to avoid a circular import at module load time.
import { store } from './state';
