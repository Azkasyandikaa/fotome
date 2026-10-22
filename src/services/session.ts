import type { Session } from '../types';
import { store } from '../app/state';
import { clearTransferState } from './exportResult';

/** URL-safe random id (no crypto dependency beyond Math.random fallback). */
function makeId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36)).join('').slice(0, 12);
}

export function createSession(templateId: string, filterId: string, photos: ImageBitmap[]): Session {
  // Revoke any previous session first — photos are temporary by design.
  destroySession();
  const session: Session = {
    id: makeId(),
    templateId,
    filterId,
    photos,
  };
  store.set('session', session);
  return session;
}

export function getSession(): Session | null {
  return store.get('session');
}

/** Clear the session (bitmaps are GC'd once nothing references them). */
export function destroySession(): void {
  store.clearSession();
  // Drop any composite draft that belonged to the finished session.
  clearTransferState();
}

/** Guard for /edit: the editor is meaningless without photos. */
export function requireSession(): Session | null {
  const s = store.get('session');
  if (!s || s.photos.length === 0) return null;
  return s;
}
